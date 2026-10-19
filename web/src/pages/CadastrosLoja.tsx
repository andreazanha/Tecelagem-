import { useEffect, useState } from "react";
import { api, type CadastroLoja } from "../api";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{c.nome || c.fantasia || "(sem nome)"}</div>
          {c.fantasia && c.fantasia !== c.nome && <div className="muted" style={{ fontSize: 12.5 }}>🏬 {c.fantasia}</div>}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {c.cnpj ? `CNPJ ${c.cnpj}` : "sem CNPJ"}{cidadeUf ? ` · ${cidadeUf}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {criadoErp
            ? <span className="fx-chip val" style={{ fontSize: 11 }}>✓ No Syntech · código {c.codigo_erp}</span>
            : c.loja_status === "aprovado"
              ? <span className="fx-chip" style={{ fontSize: 11, background: "#fef9c3", color: "#854d0e" }}>⏳ Aguardando a ponte criar no Syntech</span>
              : <span className="fx-chip" style={{ fontSize: 11, background: "#dbeafe", color: "#1e40af" }}>novo</span>}
          {c.loja_cadastro_em && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{c.loja_cadastro_em.slice(0, 16).replace("T", " ")}</div>}
        </div>
      </div>

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
