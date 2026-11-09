// Diagnóstico do Syntech — mostra as PROCEDURES (comandos) e TABELAS de estoque que a ponte
// mapeou no Firebird. Serve pra descobrir a "porta" certa pra criar OP / dar entrada no estoque
// (Etapa 4). Só leitura. Destaca os candidatos (estoque/entrada/movimento/ordem/produção).
import { useEffect, useState } from "react";
import { api } from "../api";

const CANDIDATO = /ESTOQUE|ENTRADA|SAIDA|SAÍDA|MOVIMENT|SALDO|AJUSTE|INVENT|KARDEX|\bOP\b|ORDEM|PRODUC|PRODUÇ|FABRIC/i;

type Diag = { pronto?: boolean; aviso?: string; quando?: string; total_procedures?: number; procedures?: Record<string, string>; total_tabelas?: number; tabelas?: Record<string, string[]>; erros?: string[] };

export function DiagSyntech() {
  const [estoque, setEstoque] = useState<Diag | null>(null);
  const [procs, setProcs] = useState<{ pronto?: boolean; aviso?: string; quando?: string | null; procedures?: Record<string, string> } | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  function carregar() {
    setCarregando(true); setErro("");
    Promise.allSettled([api.diagSyntechEstoque(), api.diagSyntechProcs()]).then(([e, p]) => {
      if (e.status === "fulfilled") setEstoque(e.value); else setErro((e.reason as Error).message);
      if (p.status === "fulfilled") setProcs(p.value);
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
