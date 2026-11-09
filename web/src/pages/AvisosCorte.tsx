// Aviso de urgência do Corte (WhatsApp) — 2x/dia em dias úteis (manhã e início da tarde) o
// sistema manda pro setor do Corte e pro gerente um resumo do que é urgente cortar:
// reposições críticas (estoque baixo/zerado) + pedidos de cliente perto/passados do prazo.
import { useEffect, useState } from "react";
import { api } from "../api";

const soDig = (s: string) => s.replace(/\D/g, "");
const parse = (s: string) => s.split(/[\n,;]+/).map(soDig).filter((n) => n.length >= 10);

export function AvisosCorte() {
  const [corte, setCorte] = useState("");
  const [gerente, setGerente] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [teste, setTeste] = useState<{ enviados: number; urgentes: number; msg: string; numeros: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    api.avisosCorteGet().then((r) => { setCorte((r.corte || []).join("\n")); setGerente((r.gerente || []).join("\n")); }).catch((e) => setErro((e as Error).message));
  }, []);

  async function salvar() {
    setSalvando(true); setErro(""); setMsg("");
    try { await api.avisosCorteSalvar(parse(corte), parse(gerente)); setMsg("✅ Números salvos."); }
    catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function testar() {
    setTestando(true); setErro(""); setMsg(""); setTeste(null);
    try { const r = await api.avisosCorteTestar(); setTeste(r); }
    catch (e) { setErro((e as Error).message); } finally { setTestando(false); }
  }

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>✂️ Aviso de urgência do Corte</h2>
        <span className="muted" style={{ fontSize: 12 }}>2x por dia (manhã e início da tarde), dias úteis.</span>
      </div>

      <div className="card pad" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          O sistema manda no WhatsApp um resumo do que o Corte precisa priorizar: <b>reposições críticas</b> (estoque baixo/zerado)
          e <b>pedidos de cliente</b> perto ou passados do prazo. Um número por linha (com DDD).
        </p>

        <div className="row-gap" style={{ gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📱 WhatsApp do Corte</div>
            <textarea value={corte} onChange={(e) => setCorte(e.target.value)} rows={3} placeholder={"5531999990000\n5531988887777"} style={{ width: "100%", padding: "8px 10px", fontSize: 14, fontFamily: "monospace" }} />
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📱 WhatsApp do gerente</div>
            <textarea value={gerente} onChange={(e) => setGerente(e.target.value)} rows={3} placeholder={"5531999990000"} style={{ width: "100%", padding: "8px 10px", fontSize: 14, fontFamily: "monospace" }} />
          </div>
        </div>

        <div className="row-gap" style={{ gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar números"}</button>
          <button className="btn btn-soft" disabled={testando} onClick={testar}>{testando ? "Testando…" : "📤 Testar agora"}</button>
          {msg && <span style={{ color: "#166534", fontSize: 13 }}>{msg}</span>}
          {erro && <span style={{ color: "#b91c1c", fontSize: 13 }}>{erro}</span>}
        </div>
      </div>

      {teste && (
        <div className="card pad">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Prévia do aviso {teste.enviados > 0 ? `· enviado pra ${teste.enviados} número(s) ✅` : teste.numeros === 0 ? "· (nenhum número cadastrado — só prévia)" : "· (nada urgente agora)"}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{teste.urgentes} item(ns) urgente(s).</div>
          <pre style={{ whiteSpace: "pre-wrap", background: "var(--bg-soft, #f8fafc)", padding: 12, borderRadius: 8, fontSize: 13, margin: 0 }}>{teste.msg}</pre>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        💡 "Urgente" = reposição com estoque <b>baixo ou zerado</b> (precisa cadastrar o mínimo em Precisa Produzir) + pedido de cliente com entrega <b>até 2 dias</b> ou atrasada, que esteja no Corte.
      </p>
    </>
  );
}
