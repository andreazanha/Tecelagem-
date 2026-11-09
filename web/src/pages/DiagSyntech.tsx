// Diagnóstico do Syntech — mostra as PROCEDURES (comandos) e TABELAS de estoque que a ponte
// mapeou no Firebird. Serve pra descobrir a "porta" certa pra criar OP / dar entrada no estoque
// (Etapa 4). Só leitura. Destaca os candidatos (estoque/entrada/movimento/ordem/produção).
import { useEffect, useState } from "react";
import { api } from "../api";

const CANDIDATO = /ESTOQUE|ENTRADA|SAIDA|SAÍDA|MOVIMENT|SALDO|AJUSTE|INVENT|KARDEX|\bOP\b|ORDEM|PRODUC|PRODUÇ|FABRIC|COMPRA|ORCAMENT|ORÇAMENT|\bNOTA\b|\bNF\b|\bDOC\b|INSERE|GRAVA|CADASTR/i;

type Diag = { pronto?: boolean; aviso?: string; quando?: string; total_procedures?: number; procedures?: Record<string, string>; total_tabelas?: number; tabelas?: Record<string, string[]>; erros?: string[] };
type Prod = { pronto?: boolean; aviso?: string; quando?: string | null; procedures?: Record<string, string>; geradores?: { nome: string; valor: number | null }[]; tabelas?: Record<string, string[]>; contagem?: Record<string, number | null>; amostras?: Record<string, Record<string, unknown>[]>; erros?: string[] };

export function DiagSyntech() {
  const [estoque, setEstoque] = useState<Diag | null>(null);
  const [procs, setProcs] = useState<{ pronto?: boolean; aviso?: string; quando?: string | null; procedures?: Record<string, string> } | null>(null);
  const [prod, setProd] = useState<Prod | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  function carregar() {
    setCarregando(true); setErro("");
    Promise.allSettled([api.diagSyntechEstoque(), api.diagSyntechProcs(), api.diagSyntechProducao()]).then(([e, p, pr]) => {
      if (e.status === "fulfilled") setEstoque(e.value); else setErro((e.reason as Error).message);
      if (p.status === "fulfilled") setProcs(p.value);
      if (pr.status === "fulfilled") setProd(pr.value);
    }).finally(() => setCarregando(false));
  }
  useEffect(() => { carregar(); }, []);

  const procsEstoque = estoque?.procedures || {};
  const procsApp = procs?.procedures || {};
  // junta tudo num mapa só (nome → assinatura), sem duplicar
  const todas: Record<string, string> = { ...procsApp, ...procsEstoque };
  const nomes = Object.keys(todas).sort((a, b) => {
    const ca = CANDIDATO.test(a) ? 0 : 1, cb = CANDIDATO.test(b) ? 0 : 1;
    return ca - cb || a.localeCompare(b);
  });
  const candidatos = nomes.filter((n) => CANDIDATO.test(n));
  const tabelas = estoque?.tabelas || {};
  const nomesTab = Object.keys(tabelas).sort();
  const semDados = estoque && estoque.pronto === false && !Object.keys(procsApp).length;

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🔧 Diagnóstico do Syntech</h2>
        <span className="muted" style={{ fontSize: 12 }}>Comandos (procedures) e tabelas de estoque do ERP — pra planejar a gravação (criar OP / dar entrada). Só leitura.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar} disabled={carregando}>{carregando ? "…" : "↻ Atualizar"}</button>
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c", marginBottom: 12 }}>{erro}</div>}

      {semDados && (
        <div className="card pad" style={{ marginBottom: 12, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <strong>A ponte ainda não coletou o mapa do Syntech.</strong>
          <p className="muted" style={{ marginBottom: 0 }}>{estoque?.aviso || "Espere a ponte atualizar e rodar."} Se continuar vazio depois de alguns minutos, me avisa aqui no chat que eu confirmo a versão da ponte.</p>
        </div>
      )}

      {/* ── ORDEM DE PRODUÇÃO (OP) — o que a dona está gerando no Syntech ── */}
      <div className="card" style={{ marginBottom: 14, borderColor: "#bfdbfe" }}>
        <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#1e3a8a", background: "#eff6ff" }}>
          🏭 Ordem de Produção (OP) no Syntech
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · pra ligar a OP que você cria lá na esteira daqui</span>
        </div>
        {!prod || prod.pronto === false ? (
          <div className="pad muted">{prod?.aviso || "A ponte ainda não mandou o mapa de produção."} <b>Gere/salve a OP no Syntech</b>, espere ~2-5 min a ponte atualizar e rodar, e clique em ↻ Atualizar.</div>
        ) : (
          <div className="pad" style={{ display: "grid", gap: 12 }}>
            {/* Amostras: as OPs mais novas de cada tabela de produção (o mais útil) */}
            {Object.keys(prod.amostras || {}).length === 0 && (
              <div className="muted">Encontrei {Object.keys(prod.tabelas || {}).length} tabela(s) de produção, mas ainda <b>sem linhas</b>. Se você acabou de criar a OP, espere a próxima rodada da ponte e atualize.</div>
            )}
            {/* Cada linha em formato VERTICAL (campo: valor) — pra ver todas as colunas sem rolar. */}
            {Object.entries(prod.amostras || {}).map(([tab, rows]) => (
              <div key={tab}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🗂️ {tab} <span className="muted" style={{ fontWeight: 400 }}>· {prod.contagem?.[tab] != null ? `${prod.contagem[tab]} linha(s) no total` : ""} · {rows.length} mais nova(s)</span></div>
                {rows.map((r, i) => (
                  <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: 8, marginBottom: 6, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "3px 14px" }}>
                    {Object.keys(r).map((c) => {
                      const v = r[c];
                      const vazio = v == null || v === "";
                      return (
                        <div key={c} style={{ fontSize: 11, opacity: vazio ? 0.4 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span className="muted" style={{ fontFamily: "monospace" }}>{c}:</span> <b style={{ fontFamily: "monospace", color: vazio ? "var(--muted)" : "#1e3a8a" }}>{vazio ? "—" : String(v)}</b>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
            {/* Procedures e geradores de produção */}
            {prod.procedures && Object.keys(prod.procedures).length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>⚙️ Procedures de produção ({Object.keys(prod.procedures).length})</summary>
                <table className="table" style={{ fontSize: 12 }}>
                  <tbody>{Object.entries(prod.procedures).map(([n, sig]) => <tr key={n}><td className="strong" style={{ whiteSpace: "nowrap" }}>{n}</td><td className="muted" style={{ fontFamily: "monospace" }}>{sig}</td></tr>)}</tbody>
                </table>
              </details>
            )}
            {prod.geradores && prod.geradores.length > 0 && (
              <div className="muted" style={{ fontSize: 12 }}>🔢 Numeração: {prod.geradores.map((g) => `${g.nome}=${g.valor ?? "?"}`).join(" · ")}</div>
            )}
            {prod.tabelas && Object.keys(prod.tabelas).length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>🗃️ Tabelas de produção e colunas ({Object.keys(prod.tabelas).length})</summary>
                <table className="table" style={{ fontSize: 12 }}>
                  <tbody>{Object.entries(prod.tabelas).map(([t, cols]) => <tr key={t}><td className="strong" style={{ whiteSpace: "nowrap" }}>{t}</td><td className="muted" style={{ fontSize: 11 }}>{(cols || []).join(", ")}</td></tr>)}</tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </div>

      {candidatos.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: "#bbf7d0" }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700, color: "#166534" }}>
            🎯 Candidatos (estoque / entrada / movimento / ordem / produção) <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {candidatos.length}</span>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Procedure</th><th>Parâmetros (entrada) → saída</th></tr></thead>
            <tbody>
              {candidatos.map((n) => (
                <tr key={n}><td className="strong" style={{ whiteSpace: "nowrap" }}>{n}</td><td className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{todas[n]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nomesTab.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>🗃️ Tabelas de estoque/movimento <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {nomesTab.length}</span></div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Tabela</th><th>Colunas</th></tr></thead>
            <tbody>
              {nomesTab.map((t) => (
                <tr key={t}><td className="strong" style={{ whiteSpace: "nowrap" }}>{t}</td><td className="muted" style={{ fontSize: 12 }}>{(tabelas[t] || []).join(", ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nomes.length > 0 && (
        <details className="card" style={{ marginBottom: 14 }}>
          <summary className="pad" style={{ cursor: "pointer", fontWeight: 700 }}>📋 Todas as procedures mapeadas ({nomes.length})</summary>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Procedure</th><th>Parâmetros</th></tr></thead>
            <tbody>
              {nomes.map((n) => (
                <tr key={n} style={{ background: CANDIDATO.test(n) ? "#f0fdf4" : undefined }}>
                  <td className="strong" style={{ whiteSpace: "nowrap" }}>{n}</td>
                  <td className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{todas[n]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {(estoque?.quando || procs?.quando) && <p className="muted" style={{ fontSize: 12 }}>Coletado pela ponte em: {estoque?.quando || procs?.quando}</p>}
      <p className="muted" style={{ fontSize: 12 }}>💡 Tire um print desta tela e me mande no chat — eu identifico qual procedure usar pra criar a OP e dar entrada no estoque, e aí construo a Etapa 4 com segurança.</p>
    </>
  );
}
