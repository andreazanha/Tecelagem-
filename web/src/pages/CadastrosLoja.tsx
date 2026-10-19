import { useEffect, useState } from "react";
import { api, type CadastroLoja, type ClienteCrm } from "../api";

// UFs do Norte + Nordeste → região "norte" (preço diferenciado). Demais = "sul".
const UF_NORTE = new Set(["AC", "AP", "AM", "PA", "RO", "RR", "TO", "AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);
const regiaoSugerida = (uf: string | null) => (UF_NORTE.has(String(uf || "").toUpperCase()) ? "norte" : "sul");

export function CadastrosLoja() {
  const [lista, setLista] = useState<CadastroLoja[] | null>(null);
  const [prazos, setPrazos] = useState<{ codigo: string; descricao: string }[]>([]);
  const [criarErp, setCriarErp] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const [l, p, cfg] = await Promise.all([api.cadastrosLoja(), api.cadastroPrazos(), api.cadastroLojaConfig()]);
      setLista(l); setPrazos(p); setCriarErp(cfg.criar_clientes);
    } catch { setErro("Não consegui carregar os cadastros. Atualize a página."); }
  }
  useEffect(() => { carregar(); }, []);

  async function toggleErp(v: boolean) {
    setCriarErp(v);
    try { await api.cadastroLojaConfigSalvar(v); } catch { setCriarErp(!v); alert("Não consegui salvar."); }
  }

  const pendentes = (lista || []).filter((c) => c.loja_status === "pendente");
  const aprovados = (lista || []).filter((c) => c.loja_status === "aprovado");

  return (
    <div>
      <div className="page-head">
        <div><h1>Cadastros da Loja</h1><div className="breadcrumb">Comercial › Clientes novos que se cadastraram na loja online</div></div>
      </div>

      {/* Trava de segurança: criar automático no Syntech */}
      <div className="card pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Criar o cliente no Syntech automaticamente</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, maxWidth: 560 }}>
            Quando ligado, os cadastros que você <b>aprovar</b> são criados no Syntech pela ponte (código `FUNC_CADASTRO` do site).
            Deixe <b>desligado</b> até testar o primeiro. Aprovar não cria nada enquanto isto estiver desligado.
          </div>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={!!criarErp} disabled={criarErp == null} onChange={(e) => toggleErp(e.target.checked)} />
          {criarErp ? "🟢 Ligado" : "⚪ Desligado"}
        </label>
      </div>

      {/* Dar acesso à loja a um cliente que JÁ é nosso (gera um link pra ele criar a senha) */}
      <AcessoExistente prazos={prazos} />

      {/* Dar acesso ao REPRESENTANTE (ele entra com e-mail + senha e vê a carteira dele) */}
      <AcessoRepresentante />

      {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
      {!lista ? (
        <div className="card pad muted">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="card pad muted">Nenhum cadastro novo da loja por enquanto. Quando um cliente novo se cadastrar, ele aparece aqui pra você aprovar.</div>
      ) : (
        <>
          <Secao titulo={`Aguardando aprovação (${pendentes.length})`} vazio="Nenhum cadastro aguardando.">
            {pendentes.map((c) => <CardCadastro key={c.id} c={c} prazos={prazos} onMudou={carregar} />)}
          </Secao>
          {aprovados.length > 0 && (
            <Secao titulo={`Aprovados (${aprovados.length})`} vazio="">
              {aprovados.map((c) => <CardCadastro key={c.id} c={c} prazos={prazos} onMudou={carregar} />)}
            </Secao>
          )}
        </>
      )}
    </div>
  );
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const vazioReal = arr.filter(Boolean).length === 0;
  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>{titulo}</h2>
      {vazioReal && vazio ? <div className="muted" style={{ fontSize: 13 }}>{vazio}</div> : <div style={{ display: "grid", gap: 12 }}>{children}</div>}
    </div>
  );
}

function CardCadastro({ c, prazos, onMudou }: { c: CadastroLoja; prazos: { codigo: string; descricao: string }[]; onMudou: () => void }) {
  const [regiao, setRegiao] = useState(c.loja_regiao || regiaoSugerida(c.uf));
  const [prazo, setPrazo] = useState(c.loja_cod_prazo || "1");
  const [salvando, setSalvando] = useState(false);
  const pendente = c.loja_status === "pendente";
  const criadoErp = !!c.codigo_erp;
  const cidadeUf = [c.cidade, c.uf].filter(Boolean).join("/");
  // Pendentes abrem (precisa conferir pra aprovar); aprovados ficam em UMA LINHA e abrem ao clicar.
  const [aberto, setAberto] = useState(pendente);

  async function aprovar() {
    setSalvando(true);
    try {
      const r = await api.cadastroAprovar(c.id, regiao, prazo);
      alert(r.criar_no_erp
        ? "✅ Aprovado! A ponte vai criar este cliente no Syntech na próxima sincronização (se a criação automática estiver ligada)."
        : "✅ Aprovado! (Este cliente já tem código no Syntech.)");
      onMudou();
    } catch { alert("Não consegui aprovar. Tente de novo."); } finally { setSalvando(false); }
  }
  async function recusar() {
    if (!confirm(`Recusar o cadastro de "${c.nome || c.fantasia}"? Ele não será criado no Syntech.`)) return;
    setSalvando(true);
    try { await api.cadastroRecusar(c.id); onMudou(); } catch { alert("Não consegui recusar."); } finally { setSalvando(false); }
  }

  return (
    <div className="card pad" style={{ display: "grid", gap: 10 }}>
      <div onClick={() => setAberto((v) => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{c.nome || c.fantasia || "(sem nome)"}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {c.cnpj ? `CNPJ ${c.cnpj}` : "sem CNPJ"}{cidadeUf ? ` · ${cidadeUf}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            {criadoErp
              ? <span className="fx-chip val" style={{ fontSize: 11 }}>✓ No Syntech · código {c.codigo_erp}</span>
              : c.loja_status === "aprovado"
                ? <span className="fx-chip" style={{ fontSize: 11, background: "#fef9c3", color: "#854d0e" }}>⏳ Aguardando a ponte criar no Syntech</span>
                : <span className="fx-chip" style={{ fontSize: 11, background: "#dbeafe", color: "#1e40af" }}>novo</span>}
            {c.loja_cadastro_em && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{c.loja_cadastro_em.slice(0, 16).replace("T", " ")}</div>}
          </div>
          <span style={{ color: "#94a3b8", transform: aberto ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-flex" }} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </div>
      </div>

      {aberto && <>
      {c.fantasia && c.fantasia !== c.nome && <div className="muted" style={{ fontSize: 12.5, marginTop: -2 }}>🏬 {c.fantasia}</div>}
      {/* Dados do cadastro */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6, fontSize: 12.5, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
        <Campo l="Endereço" v={[c.endereco, c.numero].filter(Boolean).join(", ") + (c.complemento ? ` (${c.complemento})` : "")} />
        <Campo l="Bairro" v={c.bairro} />
        <Campo l="CEP" v={c.cep} />
        <Campo l="Inscrição estadual" v={c.inscricao_estadual} />
        <Campo l="E-mail" v={c.email} />
        <Campo l="Telefone" v={c.telefone} />
        <Campo l="WhatsApp" v={c.whatsapp} />
        <Campo l="Simples Nacional" v={c.simples_nacional === "S" ? "Simples" : c.simples_nacional === "M" ? "MEI" : "Não"} />
      </div>

      {c.loja_erp_erro && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>⚠️ Erro ao criar no Syntech: {c.loja_erp_erro}</div>}

      {/* Ação: região + prazo + aprovar/recusar */}
      {(pendente || !criadoErp) && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <label style={{ display: "grid", gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Região de preço</span>
            <select value={regiao} onChange={(e) => setRegiao(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
              <option value="sul">Sul (preço padrão)</option>
              <option value="norte">Norte/Nordeste</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Forma de pagamento (prazo)</span>
            <select value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, minWidth: 200 }}>
              {prazos.length === 0 && <option value="1">À vista (padrão)</option>}
              {prazos.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} — {p.descricao}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {pendente && <button className="btn" disabled={salvando} onClick={recusar} style={{ color: "#b91c1c", borderColor: "#fecaca" }}>Recusar</button>}
            <button className="btn btn-primary" disabled={salvando} onClick={aprovar}>{salvando ? "Salvando…" : pendente ? "✓ Aprovar" : "Salvar / reenviar"}</button>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

// Dar acesso à loja a um cliente que já é nosso: busca na lista, CONFERE o cadastro,
// escolhe região + forma de pagamento, e gera o link (que já libera e o cliente cria a senha).
function AcessoExistente({ prazos }: { prazos: { codigo: string; descricao: string }[] }) {
  const [busca, setBusca] = useState("");
  const [matches, setMatches] = useState<ClienteCrm[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<ClienteCrm | null>(null);
  const [regiao, setRegiao] = useState("sul");
  const [prazo, setPrazo] = useState("1");
  const [link, setLink] = useState("");
  const [jaTemSenha, setJaTemSenha] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const q = busca.trim();
  // Busca no servidor (varre todos os clientes), com um pequeno atraso pra não disparar a cada tecla.
  useEffect(() => {
    if (sel) return;
    if (q.length < 2) { setMatches([]); return; }
    let vivo = true; setBuscando(true);
    const t = setTimeout(() => {
      api.cadastroBuscarCliente(q).then((r) => { if (vivo) setMatches(r); }).catch(() => { if (vivo) setMatches([]); }).finally(() => { if (vivo) setBuscando(false); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, sel]);

  function escolher(c: ClienteCrm) {
    setSel(c); setLink(""); setMsg("");
    setRegiao(c.loja_regiao === "norte" ? "norte" : regiaoSugerida(c.uf || null));
    setPrazo("1");
  }
  function trocar() { setSel(null); setLink(""); setMsg(""); setBusca(""); }

  async function gerar() {
    if (!sel) return;
    setBusy(true); setMsg(""); setLink("");
    try {
      const r = await api.cadastroGerarAcesso({ id: sel.id, regiao, cod_prazo: prazo });
      if (r.ok) { setLink(r.link); setJaTemSenha(r.tem_senha); }
      else setMsg(r.msg || "Não consegui gerar o link.");
    } catch { setMsg("Não consegui gerar o link."); } finally { setBusy(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* ok */ }
  }

  return (
    <div className="card pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>🔑 Dar acesso a um cliente que já é nosso</div>
      <div className="muted" style={{ fontSize: 12.5, maxWidth: 640 }}>
        Busque o cliente, confira os dados, escolha a <b>região</b> e a <b>forma de pagamento</b>, e gere o link.
        Ao abrir, ele <b>cria a senha dele</b> e já entra vendo os preços (não precisa aprovar — já é cliente).
      </div>

      {!sel && (
        <div style={{ maxWidth: 460 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome, CNPJ ou cidade…"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14 }} />
          {q.length >= 2 && (
            <div style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
              {buscando
                ? <div className="muted" style={{ padding: "10px 12px", fontSize: 12.5 }}>Procurando…</div>
                : matches.length === 0
                ? <div className="muted" style={{ padding: "10px 12px", fontSize: 12.5 }}>Nenhum cliente encontrado. Tente outro nome ou o CNPJ.</div>
                : matches.map((c, i) => (
                  <button key={c.id} onClick={() => escolher(c)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: 0, borderTop: i ? "1px solid var(--line)" : 0, background: "transparent", cursor: "pointer" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nome}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{c.cnpj ? c.cnpj : "sem CNPJ"}{c.cidade ? ` · ${c.cidade}/${c.uf || ""}` : ""}</div>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {sel && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{sel.nome}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{sel.cnpj ? `CNPJ ${sel.cnpj}` : "sem CNPJ"}{sel.cidade ? ` · ${sel.cidade}/${sel.uf || ""}` : ""}</div>
            </div>
            <button className="btn" onClick={trocar}>↩ Trocar cliente</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6, fontSize: 12.5, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <Campo l="WhatsApp" v={sel.whatsapp} />
            <Campo l="Contato" v={sel.contato} />
            <Campo l="E-mail" v={sel.email} />
            <Campo l="Representante" v={sel.representante} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <label style={{ display: "grid", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Região de preço</span>
              <select value={regiao} onChange={(e) => setRegiao(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
                <option value="sul">Sul (preço padrão)</option>
                <option value="norte">Norte/Nordeste</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Forma de pagamento (prazo)</span>
              <select value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, minWidth: 200 }}>
                {prazos.length === 0 && <option value="1">À vista (padrão)</option>}
                {prazos.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} — {p.descricao}</option>)}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy} onClick={gerar} style={{ marginLeft: "auto" }}>{busy ? "Gerando…" : link ? "Gerar de novo" : "🔗 Gerar link"}</button>
          </div>
          {msg && <div style={{ fontSize: 12.5, color: "#92400e" }}>{msg}</div>}
          {link && (
            <div style={{ display: "grid", gap: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#166534" }}>✓ Link gerado — envie no WhatsApp:{jaTemSenha ? " (esse cliente já tinha senha; o link serve pra redefinir)" : ""}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220, padding: "7px 9px", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 12.5, background: "#fff" }} />
                <button className="btn" onClick={copiar}>{copiado ? "✓ Copiado" : "Copiar"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dar acesso ao REPRESENTANTE: escolhe o rep, gera o link (ele cria a senha ao abrir).
// Login do rep = e-mail, então o rep precisa ter e-mail no cadastro.
function AcessoRepresentante() {
  const [reps, setReps] = useState<{ id: string; nome: string; email?: string | null; ativo?: number }[] | null>(null);
  const [sel, setSel] = useState("");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { api.listarRepresentantes().then((r) => setReps(r.filter((x) => x.ativo !== 0))).catch(() => setReps([])); }, []);
  const repSel = (reps || []).find((r) => r.id === sel);
  async function gerar() {
    if (!sel) { setMsg("Escolha um representante."); return; }
    setBusy(true); setMsg(""); setLink("");
    try {
      const r = await api.repGerarAcesso(sel);
      if (r.ok) { setLink(r.link); setMsg(r.tem_senha ? "Esse representante já tem senha — o link serve pra redefinir." : ""); }
      else setMsg(r.msg || "Não consegui gerar o link.");
    } catch { setMsg("Não consegui gerar o link."); } finally { setBusy(false); }
  }
  async function copiar() { try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* ok */ } }
  return (
    <div className="card pad" style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>🧑‍💼 Dar acesso a um representante</div>
      <div className="muted" style={{ fontSize: 12.5, maxWidth: 640 }}>
        O representante entra com o <b>e-mail + senha</b> e vê só a <b>carteira dele</b>. Gere o link e envie —
        ao abrir, ele cria a senha. <i>(O rep precisa ter e-mail no cadastro, que é o login.)</i>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={sel} onChange={(e) => { setSel(e.target.value); setLink(""); setMsg(""); }} disabled={!reps}
          style={{ padding: "9px 11px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, minWidth: 260 }}>
          <option value="">{reps ? "Escolha o representante…" : "Carregando…"}</option>
          {(reps || []).map((r) => <option key={r.id} value={r.id}>{r.nome}{r.email ? "" : " (sem e-mail!)"}</option>)}
        </select>
        <button className="btn btn-primary" disabled={busy || !sel} onClick={gerar}>{busy ? "Gerando…" : "🔗 Gerar link"}</button>
      </div>
      {repSel && !repSel.email && <div style={{ fontSize: 12.5, color: "#92400e" }}>⚠️ {repSel.nome} está sem e-mail no cadastro — cadastre o e-mail dele primeiro (é o login).</div>}
      {msg && <div style={{ fontSize: 12.5, color: "#92400e" }}>{msg}</div>}
      {link && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "9px 11px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534" }}>Link do rep {repSel?.nome}:</span>
          <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 220, padding: "7px 9px", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 12.5, background: "#fff" }} />
          <button className="btn" onClick={copiar}>{copiado ? "✓ Copiado" : "Copiar"}</button>
        </div>
      )}
    </div>
  );
}

function Campo({ l, v }: { l: string; v: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".3px" }}>{l}</div>
      <div>{v && String(v).trim() ? v : <span className="muted">—</span>}</div>
    </div>
  );
}
