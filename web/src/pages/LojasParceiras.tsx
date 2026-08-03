import { useEffect, useState } from "react";
import { api, type LojaParceira } from "../api";

const VAZIA: Partial<LojaParceira> = { nome: "", endereco: "", cidade: "", uf: "", whatsapp: "", instagram: "", site: "", ativo: 1 };

export function LojasParceiras() {
  const [lojas, setLojas] = useState<LojaParceira[]>([]);
  const [form, setForm] = useState<Partial<LojaParceira> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");
  const origem = typeof window !== "undefined" ? window.location.origin : "";

  async function carregar() {
    setCarregando(true);
    try { setLojas(await api.parceiros()); } catch { setMsg("Não consegui carregar."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const set = (k: keyof LojaParceira, v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function salvar() {
    if (!form?.nome?.trim()) { setMsg("Informe o nome da loja."); return; }
    if (!String(form?.uf ?? "").trim()) { setMsg("Informe o estado (UF) — sem ele a loja não aparece na vitrine."); return; }
    try { await api.salvarParceiro(form); setForm(null); setMsg("✓ Salvo!"); carregar(); setTimeout(() => setMsg(""), 2500); }
    catch { setMsg("Erro ao salvar."); }
  }
  async function aprovar(l: LojaParceira) { await api.salvarParceiro({ ...l, ativo: 1 }); carregar(); }
  async function alternar(l: LojaParceira) { await api.salvarParceiro({ ...l, ativo: l.ativo ? 0 : 1 }); carregar(); }
  async function excluir(l: LojaParceira) { if (confirm(`Excluir "${l.nome}"?`)) { await api.excluirParceiro(l.id); carregar(); } }
  function copiar(t: string) { navigator.clipboard?.writeText(t).then(() => { setMsg("Link copiado!"); setTimeout(() => setMsg(""), 2000); }); }

  const pendentes = lojas.filter((l) => !l.ativo);
  const ativas = lojas.filter((l) => l.ativo);
  const linkCadastro = origem + "/cadastrar-loja";
  const linkVitrine = origem + "/vitrine";

  return (
    <div className="pagina" style={{ maxWidth: 900, margin: "0 auto", padding: "0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, margin: "10px 0 6px" }}>
        <div>
          <h1 style={{ margin: 0 }}>🏬 Lojas Parceiras</h1>
          <p className="muted" style={{ margin: "2px 0 0" }}>Lojas que revendem os produtos e aparecem na vitrine pública (WhatsApp e site).</p>
        </div>
        {!form && <button className="btn btn-primary" onClick={() => setForm({ ...VAZIA })}>+ Nova loja</button>}
      </div>

      {msg && <div style={{ margin: "8px 0", padding: "8px 12px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", fontSize: 13.5 }}>{msg}</div>}

      {/* Links úteis */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 18px" }}>
        <div style={{ flex: "1 1 260px", border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🔗 Link de convite (loja se cadastra sozinha)</div>
          <div style={{ fontSize: 12, color: "#64748b", margin: "2px 0 6px" }}>Envie esse link pros lojistas preencherem os próprios dados. Entram como <b>pendentes</b> pra você aprovar.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input readOnly value={linkCadastro} style={{ flex: 1, fontSize: 12 }} />
            <button className="btn btn-soft" onClick={() => copiar(linkCadastro)}>Copiar</button>
          </div>
        </div>
        <div style={{ flex: "1 1 260px", border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>👀 Vitrine pública (o que o cliente vê)</div>
          <div style={{ fontSize: 12, color: "#64748b", margin: "2px 0 6px" }}>É esse link que a Gaby manda pro consumidor final e que dá pra usar no site.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input readOnly value={linkVitrine} style={{ flex: 1, fontSize: 12 }} />
            <button className="btn btn-soft" onClick={() => copiar(linkVitrine)}>Copiar</button>
            <a className="btn btn-soft" href={linkVitrine} target="_blank" rel="noreferrer">Abrir</a>
          </div>
        </div>
      </div>

      {/* Formulário */}
      {form && (
        <div style={{ border: "2px solid #8c6239", borderRadius: 12, padding: 16, marginBottom: 18, background: "#fffdfa", color: "#1e293b" }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? "Editar loja" : "Nova loja"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <label className="campo"><span className="campo-label">Nome da loja *</span><input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} /></label>
            <label className="campo"><span className="campo-label">Endereço</span><input value={form.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, bairro" /></label>
            <label className="campo"><span className="campo-label">Cidade</span><input value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></label>
            <label className="campo"><span className="campo-label">UF (estado) *</span><input value={form.uf ?? ""} maxLength={2} onChange={(e) => set("uf", e.target.value.toUpperCase())} placeholder="MG" style={{ border: String(form.uf ?? "").trim() ? undefined : "1.5px solid #f59e0b" }} /></label>
            <label className="campo"><span className="campo-label">WhatsApp</span><input value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(35) 9 9999-9999" /></label>
            <label className="campo"><span className="campo-label">Instagram</span><input value={form.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@sualoja" /></label>
            <label className="campo"><span className="campo-label">Site</span><input value={form.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="www.sualoja.com.br" /></label>
            <label className="campo" style={{ justifyContent: "flex-end" }}><span className="campo-label">Aparece na vitrine?</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingTop: 6 }}>
                <input type="checkbox" checked={!!form.ativo} onChange={(e) => set("ativo", e.target.checked ? 1 : 0)} style={{ width: 18, height: 18 }} /> Sim, publicar
              </label>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={salvar}>💾 Salvar</button>
            <button className="btn btn-soft" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {carregando ? <p className="muted">Carregando…</p> : (
        <>
          {pendentes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 8px", color: "#b45309" }}>⏳ Aguardando aprovação ({pendentes.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendentes.map((l) => <Cartao key={l.id} l={l} pendente onEditar={() => setForm(l)} onAprovar={() => aprovar(l)} onExcluir={() => excluir(l)} onAlternar={() => alternar(l)} />)}
              </div>
            </div>
          )}
          <h3 style={{ margin: "0 0 8px" }}>✅ Publicadas ({ativas.length})</h3>
          {ativas.length === 0 ? <p className="muted">Nenhuma loja publicada ainda. Cadastre uma ou envie o link de convite.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ativas.map((l) => <Cartao key={l.id} l={l} onEditar={() => setForm(l)} onExcluir={() => excluir(l)} onAlternar={() => alternar(l)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cartao({ l, pendente, onEditar, onAprovar, onExcluir, onAlternar }: {
  l: LojaParceira; pendente?: boolean; onEditar: () => void; onAprovar?: () => void; onExcluir: () => void; onAlternar: () => void;
}) {
  return (
    <div style={{ border: "1px solid " + (pendente ? "#fcd34d" : "var(--line,#e2e8f0)"), borderRadius: 10, padding: "10px 12px", background: pendente ? "#fffbeb" : "#fff", color: "#1e293b", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 220px" }}>
        <div style={{ fontWeight: 800 }}>{l.nome}</div>
        <div style={{ fontSize: 12.5, color: "#64748b" }}>
          {[l.endereco, [l.cidade, l.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "sem endereço"}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
          {[l.whatsapp && `📲 ${l.whatsapp}`, l.instagram && `📸 ${l.instagram}`, l.site && `🌐 ${l.site}`].filter(Boolean).join("  ·  ") || "—"}
        </div>
        {!String(l.uf ?? "").trim() && (
          <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 8px", marginTop: 5, fontWeight: 600 }}>
            ⚠️ Sem estado (UF) — não aparece na vitrine. Clique em <b>Editar</b> e informe o estado (ex.: MG).
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pendente && onAprovar && <button className="btn btn-primary" onClick={onAprovar}>✓ Aprovar</button>}
        {!pendente && <button className="btn btn-soft" onClick={onAlternar} title="Tirar da vitrine">Despublicar</button>}
        <button className="btn btn-soft" onClick={onEditar}>Editar</button>
        <button className="btn btn-soft" onClick={onExcluir} title="Excluir">🗑</button>
      </div>
    </div>
  );
}
