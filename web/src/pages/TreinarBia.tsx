import { useEffect, useState } from "react";
import { api, type IaConhecimento } from "../api";

const EXEMPLOS = [
  { p: "Qual o pedido mínimo?", r: "Nosso pedido mínimo é de R$ X (ajuste no cadastro). Posso te passar mais detalhes!" },
  { p: "Vocês fazem private label / marca própria?", r: "Fazemos sim! Vou te passar pra um vendedor especializado que cuida disso. 💛" },
  { p: "Qual o prazo de entrega?", r: "O prazo depende da quantidade e da sua região; o vendedor confirma certinho no seu pedido." },
];

export function TreinarBia() {
  const [itens, setItens] = useState<IaConhecimento[]>([]);
  const [form, setForm] = useState<Partial<IaConhecimento> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");

  async function carregar() {
    setCarregando(true);
    try { setItens(await api.conhecimento()); } catch { setMsg("Não consegui carregar."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const set = (k: keyof IaConhecimento, v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));
  async function salvar() {
    if (!form?.pergunta?.trim() || !form?.resposta?.trim()) { setMsg("Preencha a pergunta e a resposta."); return; }
    try { await api.salvarConhecimento(form); setForm(null); setMsg("✓ Salvo! A Bia já vai usar."); carregar(); setTimeout(() => setMsg(""), 2500); }
    catch { setMsg("Erro ao salvar."); }
  }
  async function alternar(i: IaConhecimento) { await api.salvarConhecimento({ ...i, ativo: i.ativo ? 0 : 1 }); carregar(); }
  async function excluir(i: IaConhecimento) { if (confirm("Excluir esta pergunta?")) { await api.excluirConhecimento(i.id); carregar(); } }

  return (
    <div className="pagina" style={{ maxWidth: 860, margin: "0 auto", padding: "0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, margin: "10px 0 6px" }}>
        <div>
          <h1 style={{ margin: 0 }}>🎓 Treinar a Bia</h1>
          <p className="muted" style={{ margin: "2px 0 0" }}>Cadastre perguntas comuns e a resposta certa. A Bia usa isso pra responder direitinho.</p>
        </div>
        {!form && <button className="btn btn-primary" onClick={() => setForm({ pergunta: "", resposta: "", ativo: 1 })}>+ Nova pergunta</button>}
      </div>

      {msg && <div style={{ margin: "8px 0", padding: "8px 12px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", fontSize: 13.5 }}>{msg}</div>}

      <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", color: "#4b3f63", borderRadius: 10, padding: "10px 13px", fontSize: 12.5, margin: "8px 0 16px", lineHeight: 1.5 }}>
        💡 Escreva a <b>pergunta como o cliente faria</b> e a <b>resposta que a Bia deve dar</b>. Ela adapta ao tom da conversa. Ideal pra: pedido mínimo, prazos, formas de pagamento, private label, dúvidas frequentes. Não invente preço aqui se não quiser que ela fale — pode mandar ela chamar o vendedor.
      </div>

      {form && (
        <div style={{ border: "2px solid #8b5cf6", borderRadius: 12, padding: 16, marginBottom: 18, background: "#fffdff", color: "#1e293b" }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? "Editar" : "Nova pergunta"}</h3>
          <label className="campo"><span className="campo-label">Pergunta do cliente</span>
            <input value={form.pergunta ?? ""} onChange={(e) => set("pergunta", e.target.value)} placeholder="Ex.: Qual o pedido mínimo de vocês?" /></label>
          <label className="campo"><span className="campo-label">Resposta que a Bia deve dar</span>
            <textarea value={form.resposta ?? ""} onChange={(e) => set("resposta", e.target.value)} rows={4} placeholder="Ex.: Nosso pedido mínimo é de R$ 500. Posso te ajudar com mais alguma coisa? 💛" style={{ resize: "vertical", fontFamily: "inherit" }} /></label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={salvar}>💾 Salvar</button>
            <button className="btn btn-soft" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {carregando ? <p className="muted">Carregando…</p> : itens.length === 0 && !form ? (
        <div style={{ textAlign: "center", padding: "24px 12px", color: "#64748b" }}>
          <p>Nenhuma pergunta cadastrada ainda. Comece com algumas comuns:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520, margin: "0 auto" }}>
            {EXEMPLOS.map((e, i) => (
              <button key={i} className="btn btn-soft" style={{ textAlign: "left", padding: "10px 12px", whiteSpace: "normal" }} onClick={() => setForm({ pergunta: e.p, resposta: e.r, ativo: 1 })}>
                <b>{e.p}</b><br /><span style={{ fontSize: 12, color: "#64748b" }}>{e.r}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.map((i) => (
            <div key={i.id} style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "10px 12px", background: i.ativo ? "#fff" : "#f8fafc", color: "#1e293b", opacity: i.ativo ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>❓ {i.pergunta}</div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 3, whiteSpace: "pre-wrap" }}>💬 {i.resposta}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-soft" onClick={() => alternar(i)} title={i.ativo ? "Desativar" : "Ativar"}>{i.ativo ? "Ativa" : "Inativa"}</button>
                  <button className="btn btn-soft" onClick={() => setForm(i)}>Editar</button>
                  <button className="btn btn-soft" onClick={() => excluir(i)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
