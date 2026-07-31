import { useEffect, useState } from "react";
import { api, type AtendSetor } from "../api";
import type { Usuario } from "../auth";

export function SetoresAtendimento() {
  const [setores, setSetores] = useState<AtendSetor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<{ id?: string; nome: string; membros: string[]; ativo: boolean } | null>(null);
  const [msg, setMsg] = useState("");

  async function carregar() {
    try {
      const [s, u] = await Promise.all([api.atendSetores(), api.listarUsuarios().catch(() => [])]);
      setSetores(s); setUsuarios(Array.isArray(u) ? u : []);
    } catch { setMsg("Não consegui carregar."); }
  }
  useEffect(() => { carregar(); }, []);

  function abrir(s?: AtendSetor) {
    setForm(s
      ? { id: s.id, nome: s.nome, membros: (s.membros || "").split(",").map((x) => x.trim()).filter(Boolean), ativo: !!s.ativo }
      : { nome: "", membros: [], ativo: true });
  }
  function toggleMembro(login: string) {
    setForm((f) => f ? { ...f, membros: f.membros.includes(login) ? f.membros.filter((m) => m !== login) : [...f.membros, login] } : f);
  }
  async function salvar() {
    if (!form?.nome.trim()) { setMsg("Informe o nome do setor."); return; }
    try { await api.atendSalvarSetor({ id: form.id, nome: form.nome.trim(), membros: form.membros, ativo: form.ativo }); setForm(null); setMsg("✓ Salvo!"); carregar(); setTimeout(() => setMsg(""), 2500); }
    catch { setMsg("Erro ao salvar."); }
  }
  async function excluir(s: AtendSetor) { if (confirm(`Excluir o setor "${s.nome}"?`)) { await api.atendExcluirSetor(s.id); carregar(); } }

  const nomeDoLogin = (login: string) => usuarios.find((u) => u.usuario === login)?.nome || login;

  return (
    <div className="pagina" style={{ maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, margin: "10px 0 6px" }}>
        <div>
          <h1 style={{ margin: 0 }}>🏢 Setores do Atendimento</h1>
          <p className="muted" style={{ margin: "2px 0 0" }}>Cadastre os setores (Vendas, Fiscal, Estoque, PCP…) e quem é de cada um.</p>
        </div>
        {!form && <button className="btn btn-primary" onClick={() => abrir()}>+ Novo setor</button>}
      </div>

      {msg && <div style={{ margin: "8px 0", padding: "8px 12px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", fontSize: 13.5 }}>{msg}</div>}

      {form && (
        <div style={{ border: "2px solid #6366f1", borderRadius: 12, padding: 16, marginBottom: 18, background: "#fbfbff", color: "#1e293b" }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? "Editar setor" : "Novo setor"}</h3>
          <label className="campo"><span className="campo-label">Nome do setor</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Vendas" /></label>
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "10px 0 6px", color: "#475569" }}>Quem é deste setor</div>
          {usuarios.length === 0 ? <p className="muted">Nenhum usuário cadastrado ainda (Cadastros → Usuários).</p> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {usuarios.map((u) => (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, background: form.membros.includes(u.usuario) ? "#eef2ff" : "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.membros.includes(u.usuario)} onChange={() => toggleMembro(u.usuario)} /> {u.nome}
                </label>
              ))}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Setor ativo
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={salvar}>💾 Salvar</button>
            <button className="btn btn-soft" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {setores.map((s) => {
          const membros = (s.membros || "").split(",").map((x) => x.trim()).filter(Boolean);
          return (
            <div key={s.id} style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "10px 12px", background: s.ativo ? "#fff" : "#f8fafc", color: "#1e293b", opacity: s.ativo ? 1 : 0.6, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontWeight: 800 }}>{s.nome} {!s.ativo && <span style={{ fontSize: 11, color: "#94a3b8" }}>(inativo)</span>}</div>
                <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
                  {membros.length ? "👥 " + membros.map(nomeDoLogin).join(", ") : "sem membros — clique em Editar pra adicionar"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-soft" onClick={() => abrir(s)}>Editar</button>
                <button className="btn btn-soft" onClick={() => excluir(s)}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
