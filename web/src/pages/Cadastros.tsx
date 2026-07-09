import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Modelo, type Cor, type TipoFio, type Tamanho, type Fornecedor, type Material, type MaterialCategoria } from "../api";
import { getUser, PAGINAS, type Usuario } from "../auth";

type AbaCad = "produtos" | "tipos-fio" | "tamanhos" | "materiais" | "fornecedores" | "operadores" | "usuarios";
const ABAS_CAD: AbaCad[] = ["produtos", "tipos-fio", "tamanhos", "materiais", "fornecedores", "operadores", "usuarios"];
const ABA_LABEL: Record<AbaCad, string> = {
  produtos: "Produtos",
  "tipos-fio": "Cores e fios",
  tamanhos: "Tamanhos",
  materiais: "Materiais",
  fornecedores: "Fornecedores",
  operadores: "Operadores",
  usuarios: "Usuários",
};

// Campo de formulário (rótulo + conteúdo), no padrão do sistema.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="campo">
      <span className="campo-label">{label}</span>
      {children}
    </label>
  );
}

export function Cadastros() {
  const ehAdmin = !!getUser()?.admin;
  const [sp] = useSearchParams();
  const [aba, setAba] = useState<AbaCad>(() => {
    const q = sp.get("aba") as AbaCad | null;
    return q && ABAS_CAD.includes(q) ? q : "produtos";
  });
  useEffect(() => {
    const q = sp.get("aba") as AbaCad | null;
    if (q && ABAS_CAD.includes(q)) setAba(q);
  }, [sp]);

  const segs: { id: AbaCad; label: string; adminOnly?: boolean }[] = [
    { id: "produtos", label: "Produtos" },
    { id: "tipos-fio", label: "Cores e fios" },
    { id: "tamanhos", label: "Tamanhos" },
    { id: "materiais", label: "Materiais" },
    { id: "fornecedores", label: "Fornecedores" },
    { id: "operadores", label: "Operadores" },
    { id: "usuarios", label: "Usuários", adminOnly: true },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cadastros</h1>
          <div className="breadcrumb">Configuração › {ABA_LABEL[aba]}</div>
        </div>
        <div className="segmented" style={{ flexWrap: "wrap" }}>
          {segs.filter((s) => !s.adminOnly || ehAdmin).map((s) => (
            <button
              key={s.id}
              type="button"
              className={"seg" + (aba === s.id ? " seg-on" : "")}
              onClick={() => setAba(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "produtos" && <AbaProdutos />}
      {aba === "tipos-fio" && <AbaFiosCores />}
      {aba === "tamanhos" && <AbaTamanhos />}
      {aba === "materiais" && <AbaMateriais />}
      {aba === "fornecedores" && <AbaFornecedores />}
      {aba === "operadores" && <OperadoresCadastro />}
      {aba === "usuarios" && ehAdmin && <UsuariosCadastro />}
    </>
  );
}

// ═══════════════════════════ Aba PRODUTOS (modelos) ═══════════════════════════
function AbaProdutos() {
  const [itens, setItens] = useState<Modelo[]>([]);
  const [busca, setBusca] = useState("");
  // null = fechado; { nome: null } = novo; { nome: "X" } = editar
  const [modal, setModal] = useState<{ nome: string | null } | null>(null);

  function recarregar() {
    api.listarModelos().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function remover(m: Modelo) {
    if (!confirm(`Excluir o produto "${m.nome}"?`)) return;
    try {
      await api.excluirModelo(m.nome);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const filtrados = itens.filter((m) => `${m.nome} ${m.ref || ""}`.toLowerCase().includes(busca.toLowerCase()));
  const p1 = itens.filter((m) => m.parte === 1).length;

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="busca-ped" placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ nome: null })}>
          ＋ Novo produto
        </button>
      </div>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Cadastro oficial de produtos: dados, cores por tipo de fio, tamanhos com peso (kg de fio por peça) e tempo de produção.
        Clique numa linha para editar. {itens.length} produtos · {p1} na Galga 3 (Parte 1).
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Código</th>
              <th>Galga / Parte</th>
              <th>Composição</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={5} className="empty pad">Nenhum produto cadastrado ainda.</td></tr>
            ) : filtrados.map((m) => (
              <tr key={m.nome} style={{ cursor: "pointer" }} onClick={() => setModal({ nome: m.nome })}>
                <td className="strong">{m.nome}</td>
                <td>{m.ref || "—"}</td>
                <td><span className="chip">{m.parte === 1 ? "Galga 3 · Parte 1" : "Galga 7 · Parte 2"}</span></td>
                <td>{m.composicao || "—"}</td>
                <td>
                  <button className="icon-btn" title="Excluir" onClick={(e) => { e.stopPropagation(); remover(m); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProdutoFormModal
          nomeEdit={modal.nome}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); recarregar(); }}
        />
      )}
    </>
  );
}

function ProdutoFormModal({ nomeEdit, onFechar, onSalvo }: { nomeEdit: string | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [ref, setRef] = useState("");
  const [parte, setParte] = useState(2);
  const [composicao, setComposicao] = useState("");
  const [cores, setCores] = useState<Cor[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [fioAberto, setFioAberto] = useState<string | null>(null); // tipo de fio expandido
  const [tamCat, setTamCat] = useState<Tamanho[]>([]);
  const [selTam, setSelTam] = useState<Record<string, boolean>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [tempos, setTempos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.listarCores(), api.listarTamanhos()])
      .then(([cs, ts]) => { setCores(cs); setTamCat(ts); })
      .catch(() => {});
    if (nomeEdit) {
      api.obterModelo(nomeEdit).then((m) => {
        setNome(m.nome);
        setRef(m.ref || "");
        setParte(m.parte);
        setComposicao(m.composicao || "");
        setSel(new Set(m.cores));
        const st: Record<string, boolean> = {}, sp: Record<string, string> = {}, stp: Record<string, string> = {};
        m.tamanhos.forEach((t) => {
          st[t.tamanho] = true;
          sp[t.tamanho] = t.peso != null ? String(t.peso) : "";
          stp[t.tamanho] = t.tempo != null ? String(t.tempo) : "";
        });
        setSelTam(st); setPesos(sp); setTempos(stp);
      }).catch((e) => setErro((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeEdit]);

  const toggleCor = (n: string) => setSel((prev) => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  function toggleGrupo(gcores: Cor[]) {
    const todas = gcores.every((c) => sel.has(c.nome));
    setSel((prev) => {
      const s = new Set(prev);
      gcores.forEach((c) => (todas ? s.delete(c.nome) : s.add(c.nome)));
      return s;
    });
  }

  async function novoTamanho() {
    const nm = prompt("Nome do novo tamanho (ex.: 50X50):");
    if (!nm || !nm.trim()) return;
    const nomeTam = nm.trim().toUpperCase();
    const ordem = tamCat.reduce((mx, t) => Math.max(mx, t.ordem), 0) + 1;
    try {
      await api.salvarTamanho({ nome: nomeTam, ordem });
      const ts = await api.listarTamanhos();
      setTamCat(ts);
      setSelTam((s) => ({ ...s, [nomeTam]: true }));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // filtro + agrupamento das cores por tipo de fio
  const filtro = busca.trim().toLowerCase();
  const coresFiltradas = cores.filter(
    (c) => !filtro || c.nome.toLowerCase().includes(filtro) || (c.codigo || "").toLowerCase().includes(filtro)
  );
  const grupos: { fio: string; fornecedor: string | null; cores: Cor[] }[] = [];
  const idx = new Map<string, number>();
  for (const c of coresFiltradas) {
    const key = c.fio_nome || "";
    if (!idx.has(key)) { idx.set(key, grupos.length); grupos.push({ fio: key, fornecedor: c.fornecedor_nome || null, cores: [] }); }
    grupos[idx.get(key)!].cores.push(c);
  }

  // tamanhos a exibir: catálogo ∪ selecionados que não estão mais no catálogo
  const extras = Object.keys(selTam).filter((n) => selTam[n] && !tamCat.some((t) => t.nome === n));
  const linhasTam: Tamanho[] = [...tamCat, ...extras.map((n, i) => ({ id: "extra-" + i, nome: n, ordem: 9999 }))];

  const nCores = sel.size;
  const nTam = linhasTam.filter((t) => selTam[t.nome]).length;

  async function salvar() {
    if (!nome.trim()) return setErro("Informe o nome do modelo.");
    setSalvando(true); setErro("");
    const tamanhos = linhasTam
      .filter((t) => selTam[t.nome])
      .map((t) => ({
        tamanho: t.nome,
        peso: pesos[t.nome] && pesos[t.nome].trim() !== "" ? Number(pesos[t.nome].replace(",", ".")) : null,
        tempo: tempos[t.nome] && tempos[t.nome].trim() !== "" ? Number(tempos[t.nome].replace(",", ".")) : null,
      }));
    try {
      await api.salvarModelo(
        { nome: nome.trim(), parte, ref: ref.trim(), composicao: composicao.trim(), cores: [...sel], tamanhos },
        nomeEdit || undefined
      );
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 900, width: "min(900px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{nomeEdit ? "Editar produto" : "Novo produto"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}

          {/* 1. Dados do produto */}
          <div className="campo-l" style={{ marginBottom: 8 }}>1 · DADOS DO PRODUTO</div>
          <div className="form-grid2">
            <Campo label="Nome do modelo *"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: PESEIRA ALANA" /></Campo>
            <Campo label="Referência"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex.: 1075" /></Campo>
            <Campo label="Galga / parte">
              <select value={parte} onChange={(e) => setParte(Number(e.target.value))}>
                <option value={2}>Galga 7 (Parte 2)</option>
                <option value={1}>Galga 3 (Parte 1)</option>
              </select>
            </Campo>
            <Campo label="Composição"><input value={composicao} onChange={(e) => setComposicao(e.target.value)} placeholder="ex.: 100% POLIÉSTER" /></Campo>
          </div>

          {/* 2. Cores deste produto */}
          <div className="campo-l" style={{ margin: "14px 0 8px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>2 · CORES DESTE PRODUTO</span>
            <span className="chip">{nCores} selecionada(s)</span>
            <input
              placeholder="🔎 filtrar por nome ou código…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ marginLeft: "auto", minWidth: 220, textTransform: "none", fontWeight: 500 }}
            />
          </div>
          {grupos.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nenhuma cor cadastrada. Cadastre na aba Cores.</p>}
          <p className="muted" style={{ fontSize: 12.5, marginTop: -2 }}>Entre num tipo de fio para ver e selecionar as cores dele.</p>
          {grupos.map((g, gi) => {
            const todas = g.cores.length > 0 && g.cores.every((c) => sel.has(c.nome));
            const nSel = g.cores.filter((c) => sel.has(c.nome)).length;
            const aberto = fioAberto === (g.fio || "—") || !!busca.trim(); // busca ativa expande tudo
            return (
              <div className={"cad-grp" + (aberto ? " aberto" : "")} key={gi}>
                <div className="cad-grp-h" style={{ cursor: "pointer" }} onClick={() => setFioAberto((f) => (f === (g.fio || "—") ? null : g.fio || "—"))}>
                  <span style={{ fontWeight: 800, color: "#64748b", width: 16 }}>{aberto ? "▾" : "▸"}</span>
                  <span className="chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{g.fio || "Sem tipo de fio"}</span>
                  {g.fornecedor && <span className="muted" style={{ fontSize: 12 }}>fornecedor: {g.fornecedor}</span>}
                  <span className="muted" style={{ fontSize: 12 }}>{g.cores.length} cor(es)</span>
                  {nSel > 0 && <span className="chip" style={{ background: "#dcfce7", color: "#166534" }}>{nSel} ✓</span>}
                  <button type="button" className="btn btn-soft" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); toggleGrupo(g.cores); }}>
                    {todas ? "desmarcar todas" : "selecionar todas"}
                  </button>
                </div>
                {aberto && (
                  <div className="cad-tiles">
                    {g.cores.map((c) => {
                      const on = sel.has(c.nome);
                      return (
                        <button type="button" key={c.nome} className={"cad-tile" + (on ? " on" : "")} onClick={() => toggleCor(c.nome)}>
                          <span className="cad-sw" style={{ background: c.hex || "#e2e8f0" }} />
                          <span style={{ textAlign: "left" }}>
                            <span className="cad-tile-nm">{c.nome}</span>
                            <br />
                            <span className="cad-tile-cd">{c.codigo || "—"}</span>
                          </span>
                          {on && <span className="cad-tile-ck">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 3. Tamanhos, peso e tempo */}
          <div className="campo-l" style={{ margin: "14px 0 8px", display: "flex", alignItems: "center", gap: 10 }}>
            <span>3 · TAMANHOS, PESO E TEMPO</span>
            <button type="button" className="btn btn-soft" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }} onClick={novoTamanho}>＋ novo tamanho</button>
          </div>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Tamanho</th>
                  <th className="num">Peso (por peça)</th>
                  <th className="num">Tempo de produção</th>
                </tr>
              </thead>
              <tbody>
                {linhasTam.length === 0 ? (
                  <tr><td colSpan={4} className="empty pad">Nenhum tamanho cadastrado. Use “＋ novo tamanho”.</td></tr>
                ) : linhasTam.map((t) => {
                  const on = !!selTam[t.nome];
                  return (
                    <tr key={t.id} style={{ opacity: on ? 1 : 0.5 }}>
                      <td><input type="checkbox" checked={on} onChange={(e) => setSelTam((s) => ({ ...s, [t.nome]: e.target.checked }))} /></td>
                      <td className="strong">{t.nome}</td>
                      <td className="num">
                        <span className="row-gap" style={{ gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                          <input className="w-xs num" type="number" min={0} step="any" disabled={!on} value={pesos[t.nome] ?? ""} onChange={(e) => setPesos((p) => ({ ...p, [t.nome]: e.target.value }))} />
                          <span className="muted" style={{ fontSize: 12 }}>kg</span>
                        </span>
                      </td>
                      <td className="num">
                        <span className="row-gap" style={{ gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                          <input className="w-xs num" type="number" min={0} step="any" disabled={!on} value={tempos[t.nome] ?? ""} onChange={(e) => setTempos((p) => ({ ...p, [t.nome]: e.target.value }))} />
                          <span className="muted" style={{ fontSize: 12 }}>min</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16, alignItems: "center" }}>
            <span className="muted" style={{ marginRight: "auto", fontSize: 13 }}>
              <strong>{nCores}</strong> cores × <strong>{nTam}</strong> tamanhos = <strong>{nCores * nTam}</strong> variações
            </span>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" style={{ background: "#16a34a" }} disabled={salvando} onClick={salvar}>
              {salvando ? "Salvando…" : "✔ Salvar produto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba TIPOS DE FIO + CORES ═══════════════════════════
// Uma tela só: lista de tipos de fio; ao entrar num tipo de fio aparecem todas
// as cores daquele fio (cadastro/edição das cores lá dentro).
function AbaFiosCores() {
  const [tipos, setTipos] = useState<TipoFio[]>([]);
  const [cores, setCores] = useState<Cor[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [aberto, setAberto] = useState<string | null>(null); // fio id aberto; "" = sem fio; null = lista
  const [modalCor, setModalCor] = useState<{ cor: Cor | null; fioInicial?: string } | null>(null);
  const [agrupar, setAgrupar] = useState(false);
  const [fioForm, setFioForm] = useState<{ id: string | null; nome: string; fornId: string; cor: string } | null>(null);

  function recarregar() {
    api.listarTiposFio().then(setTipos).catch(() => {});
    api.listarCores().then(setCores).catch(() => {});
  }
  useEffect(() => { recarregar(); api.listarFornecedores().then(setFornecedores).catch(() => {}); }, []);

  const coresDoFio = (fioId: string) => cores.filter((c) => (fioId === "" ? !c.fio_id : c.fio_id === fioId));

  async function removerCor(c: Cor) {
    if (!confirm(`Excluir a cor "${c.nome}"?`)) return;
    try { await api.excluirCor(c.nome); recarregar(); } catch (e) { alert((e as Error).message); }
  }
  async function salvarFio() {
    if (!fioForm || !fioForm.nome.trim()) return alert("Informe o nome do tipo de fio.");
    try {
      await api.salvarTipoFio({ id: fioForm.id || undefined, nome: fioForm.nome.trim(), fornecedor_id: fioForm.fornId || null, cor: fioForm.cor });
      setFioForm(null); recarregar();
    } catch (e) { alert((e as Error).message); }
  }
  async function removerFio(t: TipoFio) {
    if (!confirm(`Excluir o tipo de fio "${t.nome}"? As cores dele ficam sem tipo de fio.`)) return;
    try { await api.excluirTipoFio(t.id); recarregar(); } catch (e) { alert((e as Error).message); }
  }

  // ── DETALHE: dentro de um tipo de fio → suas cores ──
  if (aberto !== null) {
    const fio = tipos.find((t) => t.id === aberto);
    const lista = coresDoFio(aberto);
    return (
      <>
        <button className="btn" style={{ marginBottom: 12 }} onClick={() => setAberto(null)}>← Tipos de fio</button>
        <div className="card">
          <div className="row-gap" style={{ alignItems: "center", gap: 12, padding: "12px 14px", flexWrap: "wrap" }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: fio?.cor || "#94a3b8", boxShadow: "0 0 0 1px #0002", flex: "0 0 auto" }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>{fio ? fio.nome : "Sem tipo de fio"}</span>
            {fio?.fornecedor_nome && <span className="muted" style={{ fontSize: 12 }}>fornecedor: {fio.fornecedor_nome}</span>}
            <span className="muted" style={{ fontSize: 12 }}>{lista.length} cor(es)</span>
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setModalCor({ cor: null, fioInicial: aberto || undefined })}>＋ Nova cor</button>
          </div>
          <table className="table">
            <thead><tr><th>Cor</th><th>Código</th><th></th></tr></thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={3} className="empty pad">Nenhuma cor nesse tipo de fio ainda.</td></tr>
              ) : lista.map((c) => (
                <tr key={c.nome}>
                  <td><span className="row-gap" style={{ alignItems: "center", gap: 8 }}><span className="cad-sw" style={{ background: c.hex || "#e2e8f0" }} /><span className="strong">{c.nome}</span></span></td>
                  <td><span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{c.codigo || "—"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="icon-btn" title="Editar" onClick={() => setModalCor({ cor: c })}>✎</button>
                    <button className="icon-btn" title="Excluir" onClick={() => removerCor(c)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {modalCor && <CorModal cor={modalCor.cor} fioInicial={modalCor.fioInicial} onFechar={() => setModalCor(null)} onSalvo={() => { setModalCor(null); recarregar(); }} />}
      </>
    );
  }

  // ── LISTA: cards de tipos de fio ──
  const semFio = coresDoFio("");
  return (
    <>
      <div className="row-gap" style={{ marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <p className="muted" style={{ margin: 0 }}>Entre num tipo de fio para ver e cadastrar as cores dele.</p>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => setAgrupar(true)}>Agrupar cores</button>
        <button className="btn btn-primary" onClick={() => setFioForm({ id: null, nome: "", fornId: "", cor: CORES_FIO[0] })}>＋ Novo tipo de fio</button>
      </div>

      {fioForm && (
        <div className="card pad" style={{ marginBottom: 14 }}>
          <h2>{fioForm.id ? "Editar tipo de fio" : "Novo tipo de fio"}</h2>
          <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
            <label className="fld">Nome<input autoFocus value={fioForm.nome} onChange={(e) => setFioForm({ ...fioForm, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarFio()} style={{ minWidth: 200 }} /></label>
            <label className="fld">Fornecedor
              <select value={fioForm.fornId} onChange={(e) => setFioForm({ ...fioForm, fornId: e.target.value })} style={{ minWidth: 180 }}>
                <option value="">Sem fornecedor</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
            <div className="fld">Ícone de cor
              <div className="row-gap" style={{ gap: 6 }}>
                {CORES_FIO.map((h) => <button type="button" key={h} onClick={() => setFioForm({ ...fioForm, cor: h })} style={{ width: 26, height: 26, borderRadius: 7, background: h, cursor: "pointer", border: "2px solid #fff", boxShadow: fioForm.cor === h ? "0 0 0 2px #0f172a" : "0 0 0 1px #cbd5e1" }} />)}
              </div>
            </div>
            <button className="btn btn-primary" onClick={salvarFio}>{fioForm.id ? "Salvar" : "Adicionar"}</button>
            <button className="btn" onClick={() => setFioForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="cad-fios">
        {tipos.map((t) => (
          <div className="cad-fio-card" key={t.id} onClick={() => setAberto(t.id)}>
            <span className="ic" style={{ background: t.cor || "#94a3b8" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">{t.nome}</div>
              <div className="sub">{t.fornecedor_nome || "sem fornecedor"} · {coresDoFio(t.id).length} cor(es)</div>
            </div>
            <button className="icon-btn" title="Editar" onClick={(e) => { e.stopPropagation(); setFioForm({ id: t.id, nome: t.nome, fornId: t.fornecedor_id || "", cor: t.cor || CORES_FIO[0] }); }}>✎</button>
            <button className="icon-btn" title="Excluir" onClick={(e) => { e.stopPropagation(); removerFio(t); }}>✕</button>
          </div>
        ))}
        {semFio.length > 0 && (
          <div className="cad-fio-card" onClick={() => setAberto("")}>
            <span className="ic" style={{ background: "#94a3b8" }} />
            <div style={{ flex: 1 }}><div className="nm">Sem tipo de fio</div><div className="sub">{semFio.length} cor(es)</div></div>
          </div>
        )}
        {tipos.length === 0 && semFio.length === 0 && <div className="card" style={{ gridColumn: "1/-1" }}><p className="empty pad">Nenhum tipo de fio ainda. Crie um acima.</p></div>}
      </div>

      {agrupar && <AgruparFioModal cores={cores} onFechar={() => setAgrupar(false)} onSalvo={() => { setAgrupar(false); recarregar(); }} />}
    </>
  );
}

// Selecionar várias cores e jogar dentro de um tipo de fio de uma vez.
function AgruparFioModal({ cores, onFechar, onSalvo }: { cores: Cor[]; onFechar: () => void; onSalvo: () => void }) {
  const [tipos, setTipos] = useState<TipoFio[]>([]);
  const [fioId, setFioId] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.listarTiposFio().then(setTipos).catch(() => {}); }, []);

  const q = busca.trim().toLowerCase();
  const lista = cores.filter((c) => !q || `${c.nome} ${c.codigo || ""} ${c.fio_nome || ""}`.toLowerCase().includes(q));
  const toggle = (nome: string) => setSel((s) => { const n = new Set(s); n.has(nome) ? n.delete(nome) : n.add(nome); return n; });

  async function salvar() {
    if (!fioId) return alert("Escolha o tipo de fio.");
    if (!sel.size) return alert("Selecione ao menos uma cor.");
    setSalvando(true);
    try {
      const r = await api.atribuirFioCores(fioId, [...sel]);
      onSalvo();
      alert(`${r.atualizadas} cor(es) movida(s) para o tipo de fio.`);
    } catch (e) { alert((e as Error).message); setSalvando(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">Agrupar cores num tipo de fio</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          <Campo label="Tipo de fio de destino *">
            <select value={fioId} onChange={(e) => setFioId(e.target.value)}>
              <option value="">— escolha o tipo de fio —</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.fornecedor_nome ? ` · ${t.fornecedor_nome}` : ""}</option>)}
            </select>
          </Campo>
          <input className="busca-ped" style={{ width: "100%", margin: "8px 0" }} placeholder="🔎 Buscar cor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="cad-tiles" style={{ maxHeight: "46vh", overflowY: "auto" }}>
            {lista.map((c) => (
              <div key={c.nome} className={"cad-tile" + (sel.has(c.nome) ? " on" : "")} onClick={() => toggle(c.nome)}>
                <span className="cad-tile-ck">✓</span>
                <span className="cad-sw" style={{ background: c.hex || "#e2e8f0", width: 40, height: 40 }} />
                <span className="cad-tile-nm">{c.nome}</span>
                <span className="cad-tile-cd">{c.codigo || ""}</span>
              </div>
            ))}
            {lista.length === 0 && <p className="muted pad">Nenhuma cor.</p>}
          </div>
          <div className="row-gap" style={{ justifyContent: "space-between", marginTop: 14, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>{sel.size} cor(es) selecionada(s)</span>
            <span className="row-gap">
              <button className="btn" onClick={onFechar}>Cancelar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Mover para o fio"}</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CorModal({ cor, fioInicial, onFechar, onSalvo }: { cor: Cor | null; fioInicial?: string; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(cor?.nome || "");
  const [codigo, setCodigo] = useState(cor?.codigo || "");
  const [fioId, setFioId] = useState(cor?.fio_id || fioInicial || "");
  const [hex, setHex] = useState(cor?.hex || "#cccccc");
  const [tipos, setTipos] = useState<TipoFio[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function carregarTipos() {
    api.listarTiposFio().then(setTipos).catch(() => {});
  }
  useEffect(carregarTipos, []);

  async function addTipoFio() {
    const nm = prompt("Nome do novo tipo de fio:");
    if (!nm || !nm.trim()) return;
    try {
      const t = await api.salvarTipoFio({ nome: nm.trim(), fornecedor_id: null });
      const ts = await api.listarTiposFio();
      setTipos(ts);
      if (t?.id) setFioId(t.id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function salvar() {
    if (!nome.trim()) return setErro("Informe o nome da cor.");
    setSalvando(true); setErro("");
    try {
      await api.salvarCor({
        nome: nome.trim(),
        de: cor && cor.nome !== nome.trim() ? cor.nome : undefined,
        codigo: codigo.trim() || null,
        hex,
        fio_id: fioId || null,
      });
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{cor ? "Editar cor" : "Nova cor"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="form-grid2">
            <Campo label="Nome da cor *"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: ROMENIA" /></Campo>
            <Campo label="Código"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: 1075" /></Campo>
          </div>
          <Campo label="Tipo de fio">
            <div className="row-gap" style={{ gap: 6 }}>
              <select value={fioId} onChange={(e) => setFioId(e.target.value)} style={{ flex: 1 }}>
                <option value="">— sem tipo de fio —</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.fornecedor_nome ? ` · ${t.fornecedor_nome}` : ""}</option>)}
              </select>
              <button className="btn btn-soft" type="button" title="Adicionar tipo de fio" onClick={addTipoFio}>＋</button>
            </div>
          </Campo>
          <Campo label="Cor (visual)">
            <div className="row-gap" style={{ alignItems: "center", gap: 6 }}>
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} style={{ width: 44, height: 32, padding: 2 }} />
              <input value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB" style={{ flex: 1 }} />
            </div>
          </Campo>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar cor"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba TIPOS DE FIO ═══════════════════════════
const CORES_FIO = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#dc2626", "#ca8a04", "#64748b"];

// ═══════════════════════════ Aba TAMANHOS ═══════════════════════════
function AbaTamanhos() {
  const [itens, setItens] = useState<Tamanho[]>([]);
  const [colar, setColar] = useState("");
  const [processando, setProcessando] = useState(false);

  function recarregar() {
    api.listarTamanhos().then((ts) => setItens([...ts].sort((a, b) => a.ordem - b.ordem))).catch(() => {});
  }
  useEffect(recarregar, []);

  async function processar() {
    if (!colar.trim()) return;
    setProcessando(true);
    try {
      const r = await api.bulkTamanhos(colar);
      setColar("");
      recarregar();
      alert(`${r.criados} tamanho(s) adicionado(s) e ordenado(s).${r.ignorados ? ` ${r.ignorados} já existia(m).` : ""}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProcessando(false);
    }
  }
  async function remover(t: Tamanho) {
    if (!confirm(`Excluir o tamanho "${t.nome}"?`)) return;
    try { await api.excluirTamanho(t.id); recarregar(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>Digite ou cole os tamanhos</h2>
        <p className="muted" style={{ marginTop: 4, marginBottom: 10 }}>Separe do jeito que quiser (vírgula, espaço, linha). Eu padronizo (50X50) e <strong>coloco em ordem</strong> automaticamente.</p>
        <textarea
          value={colar}
          onChange={(e) => setColar(e.target.value)}
          placeholder={"ex.: 50x50, 90x200, 1.20x1.80\n45x45  0.90x1.20  70x250"}
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
        />
        <div className="row-gap" style={{ marginTop: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-primary" disabled={processando || !colar.trim()} onClick={processar}>{processando ? "Processando…" : "✓ Adicionar e ordenar"}</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th className="num">Ordem</th><th>Tamanho</th><th></th></tr></thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={3} className="empty pad">Nenhum tamanho cadastrado ainda.</td></tr>
            ) : itens.map((t) => (
              <tr key={t.id}>
                <td className="num">{t.ordem}</td>
                <td className="strong">{t.nome}</td>
                <td><button className="icon-btn" title="Remover" onClick={() => remover(t)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ═══════════════════════════ Aba MATERIAIS ═══════════════════════════
const MAT_CATS: { id: MaterialCategoria; label: string; cor: string }[] = [
  { id: "forro", label: "Forro", cor: "#0891b2" },
  { id: "ziper", label: "Zíper", cor: "#7c3aed" },
  { id: "etiqueta", label: "Etiqueta", cor: "#ca8a04" },
  { id: "encarte", label: "Encarte", cor: "#16a34a" },
  { id: "embalagem", label: "Embalagem", cor: "#ea580c" },
  { id: "refil", label: "Refil", cor: "#db2777" },
];

function AbaMateriais() {
  // Cadastro SEPARADO por material (sub-aba): cada material tem sua própria tela
  // e lista — base pro controle de estoque de cada um.
  const [cat, setCat] = useState<MaterialCategoria>("forro");
  const meta = MAT_CATS.find((c) => c.id === cat)!;
  return (
    <>
      <div className="segmented" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {MAT_CATS.map((c) => (
          <button type="button" key={c.id} className={"seg" + (cat === c.id ? " seg-on" : "")} onClick={() => setCat(c.id)}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: c.cor, marginRight: 7 }} />{c.label}
          </button>
        ))}
      </div>
      <CadastroMaterial key={cat} categoria={cat} label={meta.label} cor={meta.cor} />
    </>
  );
}

// Uma tela de cadastro para UM material (forro, zíper, etc.). Só desse material.
function CadastroMaterial({ categoria, label, cor: catCor }: { categoria: MaterialCategoria; label: string; cor: string }) {
  const [itens, setItens] = useState<Material[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [fornId, setFornId] = useState("");
  const [cor, setCor] = useState("");
  const [corHex, setCorHex] = useState("#333333");
  const [codigo, setCodigo] = useState("");
  const isZip = categoria === "ziper";

  function recarregar() { api.listarMateriais(categoria).then(setItens).catch(() => {}); }
  useEffect(() => { recarregar(); api.listarFornecedores().then(setFornecedores).catch(() => {}); /* eslint-disable-next-line */ }, [categoria]);

  function limpar() { setEditId(null); setNome(""); setTamanho(""); setFornId(""); setCor(""); setCorHex("#333333"); setCodigo(""); }
  function editar(m: Material) { setEditId(m.id); setNome(m.nome); setTamanho(m.tamanho || ""); setFornId(m.fornecedor_id || ""); setCor(m.cor || ""); setCorHex(m.cor_hex || "#333333"); setCodigo(m.codigo || ""); }

  async function salvar() {
    if (!nome.trim()) return alert("Informe o nome do material.");
    try {
      await api.salvarMaterial({
        id: editId || undefined, categoria, nome: nome.trim(), tamanho: tamanho.trim() || null, fornecedor_id: fornId || null,
        cor: isZip ? (cor.trim() || null) : null, cor_hex: isZip ? corHex : null, codigo: isZip ? (codigo.trim() || null) : null,
      });
      limpar(); recarregar();
    } catch (e) { alert((e as Error).message); }
  }
  async function remover(m: Material) {
    if (!confirm(`Excluir "${m.nome}${m.tamanho ? " " + m.tamanho : ""}"?`)) return;
    try { await api.excluirMaterial(m.id); if (editId === m.id) limpar(); recarregar(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>{editId ? `Editar ${label.toLowerCase()}` : `Novo ${label.toLowerCase()}`}</h2>
        <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <label className="fld">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`ex.: ${label} branco`} style={{ minWidth: 200 }} /></label>
          <label className="fld">Tamanho<input value={tamanho} onChange={(e) => setTamanho(e.target.value)} placeholder="ex.: 90X200" style={{ width: 130 }} /></label>
          <label className="fld">Fornecedor
            <select value={fornId} onChange={(e) => setFornId(e.target.value)} style={{ minWidth: 170 }}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </label>
          {isZip && <>
            <label className="fld">Cor<input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="ex.: Preto" style={{ width: 120 }} /></label>
            <label className="fld">Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Z5-PT" style={{ width: 110 }} /></label>
            <label className="fld">Amostra<input type="color" value={corHex} onChange={(e) => setCorHex(e.target.value)} style={{ width: 46, height: 36, padding: 2 }} /></label>
          </>}
          <button className="btn btn-primary" onClick={salvar}>{editId ? "Salvar" : "＋ Adicionar"}</button>
          {editId && <button className="btn" onClick={limpar}>Cancelar</button>}
        </div>
      </div>

      <div className="card">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, padding: "10px 12px" }}>
          <span className="chip" style={{ background: catCor, color: "#fff" }}>{label}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{itens.length} item(ns)</span>
        </div>
        <table className="table">
          <thead><tr><th>Material</th>{isZip && <th>Cor / Código</th>}<th>Tamanho</th><th>Fornecedor</th><th></th></tr></thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={isZip ? 5 : 4} className="empty pad">Nenhum {label.toLowerCase()} cadastrado ainda.</td></tr>
            ) : itens.map((m) => (
              <tr key={m.id}>
                <td className="strong">{m.nome}</td>
                {isZip && (
                  <td><span className="cad-sw" style={{ background: m.cor_hex || "#e2e8f0", marginRight: 7 }} />{m.cor || "—"} {m.codigo && <span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{m.codigo}</span>}</td>
                )}
                <td className="strong">{m.tamanho || "—"}</td>
                <td>{m.fornecedor_nome || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="icon-btn" title="Editar" onClick={() => editar(m)}>✎</button>
                  <button className="icon-btn" title="Excluir" onClick={() => remover(m)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ═══════════════════════════ Aba FORNECEDORES ═══════════════════════════
function AbaFornecedores() {
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ f: Partial<Fornecedor> } | null>(null);

  function recarregar() {
    api.listarFornecedores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function remover(f: Fornecedor) {
    if (!confirm(`Excluir o fornecedor "${f.nome}"?`)) return;
    try { await api.excluirFornecedor(f.id); recarregar(); } catch (e) { alert((e as Error).message); }
  }

  const filtro = busca.trim().toLowerCase();
  const filtrados = itens.filter((f) => !filtro || `${f.nome} ${f.contato || ""} ${f.cnpj || ""}`.toLowerCase().includes(filtro));

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="busca-ped" placeholder="🔎 Buscar fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ f: { nome: "", ativo: 1 } })}>＋ Novo fornecedor</button>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Nome</th><th>Contato</th><th>Telefone</th><th>CNPJ</th><th></th></tr></thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={5} className="empty pad">Nenhum fornecedor cadastrado ainda.</td></tr>
            ) : filtrados.map((f) => (
              <tr key={f.id} style={{ cursor: "pointer" }} onClick={() => setModal({ f })}>
                <td className="strong">{f.nome}</td>
                <td>{f.contato || "—"}</td>
                <td>{f.telefone || "—"}</td>
                <td>{f.cnpj || "—"}</td>
                <td><button className="icon-btn" title="Excluir" onClick={(e) => { e.stopPropagation(); remover(f); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <FornecedorModal fornecedor={modal.f} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar(); }} />}
    </>
  );
}

function FornecedorModal({ fornecedor, onFechar, onSalvo }: { fornecedor: Partial<Fornecedor>; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<Partial<Fornecedor>>(fornecedor);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (patch: Partial<Fornecedor>) => setF((o) => ({ ...o, ...patch }));

  async function salvar() {
    if (!f.nome?.trim()) return setErro("Informe o nome do fornecedor.");
    setSalvando(true); setErro("");
    try {
      await api.salvarFornecedor(f);
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{f.id ? "Editar fornecedor" : "Novo fornecedor"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="form-grid2">
            <Campo label="Nome *"><input value={f.nome || ""} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Fios do Sul" /></Campo>
            <Campo label="Contato"><input value={f.contato || ""} onChange={(e) => set({ contato: e.target.value })} placeholder="pessoa de contato" /></Campo>
            <Campo label="Telefone"><input value={f.telefone || ""} onChange={(e) => set({ telefone: e.target.value })} placeholder="(00) 00000-0000" /></Campo>
            <Campo label="E-mail"><input value={f.email || ""} onChange={(e) => set({ email: e.target.value })} placeholder="contato@fornecedor.com" /></Campo>
            <Campo label="CNPJ"><input value={f.cnpj || ""} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></Campo>
          </div>
          <Campo label="Observação"><textarea value={f.observacao || ""} onChange={(e) => set({ observacao: e.target.value })} rows={2} /></Campo>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar fornecedor"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Operadores (lista pré-salva usada ao iniciar produção) ────────────────────
function OperadoresCadastro() {
  const [itens, setItens] = useState<{ id: string; nome: string; setor: string | null }[]>([]);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [setor, setSetor] = useState("");

  function recarregar() {
    api.listarOperadores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function adicionar() {
    if (!nome.trim() || !senha.trim()) {
      alert("Informe nome e senha.");
      return;
    }
    try {
      await api.salvarOperador({ nome: nome.trim(), senha: senha.trim(), setor: setor || undefined });
      setNome("");
      setSenha("");
      setSetor("");
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function remover(id: string) {
    await api.removerOperador(id);
    recarregar();
  }

  const SETORES = ["tecelagem", "passadoria", "corte", "costura", "revisao", "estoque", "expedicao"];

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>Novo operador</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Ao iniciar uma produção, a pessoa seleciona o nome e digita a senha. Deixe o setor em branco
          para liberar em todos os setores.
        </p>
        <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <input placeholder="Nome do operador" value={nome} onChange={(e) => setNome(e.target.value)} style={{ minWidth: 200 }} />
          <input placeholder="Senha" type="text" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ minWidth: 140 }} />
          <select value={setor} onChange={(e) => setSetor(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Todos os setores</option>
            {SETORES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={adicionar}>＋ Adicionar</button>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Operador</th>
            <th>Setor</th>
            <th>Senha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">Nenhum operador cadastrado ainda.</td>
            </tr>
          )}
          {itens.map((o) => (
            <tr key={o.id}>
              <td data-label="Operador"><strong>{o.nome}</strong></td>
              <td data-label="Setor">{o.setor ? o.setor.charAt(0).toUpperCase() + o.setor.slice(1) : "Todos"}</td>
              <td data-label="Senha">••••</td>
              <td>
                <button className="icon-btn" title="Remover" onClick={() => remover(o.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Telas agrupadas como no menu lateral — facilita escolher o que cada usuário acessa.
const GRUPOS_PERM: { titulo: string; keys: string[] }[] = [
  { titulo: "Comercial", keys: ["pedidos", "todos-pedidos"] },
  { titulo: "Produção", keys: ["producao", "passadoria", "corte", "costura", "revisao"] },
  { titulo: "Estoque e Insumos", keys: ["estoque", "produtos"] },
  { titulo: "Expedição", keys: ["expedicao", "transporte", "romaneios"] },
  { titulo: "Fiscal e Financeiro", keys: ["fiscal"] },
  { titulo: "Cadastros", keys: ["cadastros"] },
  { titulo: "Painéis (TV)", keys: ["tv-dashboard", "tv-tecelagem", "tv-costura", "tv-revisao", "tv-novo-pedido"] },
];
const labelDaPagina = (k: string) => PAGINAS.find((p) => p.key === k)?.label || k;

// ── Usuários (login + permissões de telas) — somente admin ────────────────────
function UsuariosCadastro() {
  const [itens, setItens] = useState<Usuario[]>([]);
  const vazio = { nome: "", usuario: "", senha: "", admin: false, paginas: [] as string[] };
  const [novo, setNovo] = useState<{ nome: string; usuario: string; senha: string; admin: boolean; paginas: string[] }>(vazio);
  const [editId, setEditId] = useState<string | null>(null);

  function recarregar() {
    api.listarUsuarios().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  function toggle(key: string) {
    setNovo((f) => ({ ...f, paginas: f.paginas.includes(key) ? f.paginas.filter((k) => k !== key) : [...f.paginas, key] }));
  }
  // marca/desmarca todas as telas de um grupo de uma vez
  function marcarGrupo(keys: string[], on: boolean) {
    setNovo((f) => {
      const set = new Set(f.paginas);
      keys.forEach((k) => (on ? set.add(k) : set.delete(k)));
      return { ...f, paginas: [...set] };
    });
  }
  async function salvar() {
    if (!novo.nome.trim() || !novo.usuario.trim()) return alert("Informe nome e usuário.");
    if (!editId && !novo.senha.trim()) return alert("Informe uma senha.");
    try {
      await api.salvarUsuario({ id: editId || undefined, nome: novo.nome.trim(), usuario: novo.usuario.trim(), senha: novo.senha.trim() || undefined, admin: novo.admin, paginas: novo.paginas });
      setNovo(vazio);
      setEditId(null);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  function editar(u: Usuario) {
    setEditId(u.id);
    setNovo({ nome: u.nome, usuario: u.usuario, senha: "", admin: u.admin, paginas: u.paginas });
  }
  async function remover(u: Usuario) {
    if (u.usuario === "admin") return alert("O usuário admin não pode ser removido.");
    if (!confirm(`Remover ${u.nome}?`)) return;
    await api.removerUsuario(u.id);
    recarregar();
  }

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>{editId ? "Editar usuário" : "Novo usuário"}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Defina o login e marque as telas que essa pessoa pode usar. Admin enxerga tudo.
          {editId && " Deixe a senha em branco para mantê-la."}
        </p>
        <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} style={{ minWidth: 180 }} />
          <input placeholder="Usuário (login)" value={novo.usuario} onChange={(e) => setNovo({ ...novo, usuario: e.target.value })} style={{ minWidth: 160 }} />
          <input placeholder={editId ? "Senha (manter)" : "Senha"} type="text" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} style={{ minWidth: 140 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <input type="checkbox" checked={novo.admin} onChange={(e) => setNovo({ ...novo, admin: e.target.checked })} /> Admin (tudo)
          </label>
        </div>
        {!novo.admin && (
          <div style={{ marginTop: 14 }}>
            <div className="campo-l">TELAS LIBERADAS PARA ESTE USUÁRIO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              {GRUPOS_PERM.map((g) => {
                const marcados = g.keys.filter((k) => novo.paginas.includes(k)).length;
                const todos = marcados === g.keys.length;
                return (
                  <div key={g.titulo} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 12.5 }}>{g.titulo}</strong>
                      <span className="muted" style={{ fontSize: 11 }}>{marcados}/{g.keys.length}</span>
                      <button type="button" className="btn btn-soft" style={{ marginLeft: "auto", padding: "3px 9px", fontSize: 11 }} onClick={() => marcarGrupo(g.keys, !todos)}>
                        {todos ? "Desmarcar todos" : "Marcar todos"}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {g.keys.map((k) => (
                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, background: novo.paginas.includes(k) ? "#eef2ff" : "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px" }}>
                          <input type="checkbox" checked={novo.paginas.includes(k)} onChange={() => toggle(k)} />
                          {k.startsWith("tv-") ? "📺 " : ""}{labelDaPagina(k)}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="row-gap" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvar}>{editId ? "Salvar" : "＋ Adicionar"}</button>
          {editId && <button className="btn" onClick={() => { setEditId(null); setNovo(vazio); }}>Cancelar</button>}
        </div>
      </div>

      <table className="table">
        <thead><tr><th>Nome</th><th>Usuário</th><th>Acesso</th><th></th></tr></thead>
        <tbody>
          {itens.length === 0 && <tr><td colSpan={4} className="muted">Nenhum usuário ainda.</td></tr>}
          {itens.map((u) => (
            <tr key={u.id}>
              <td data-label="Nome"><strong>{u.nome}</strong></td>
              <td data-label="Usuário">{u.usuario}</td>
              <td data-label="Acesso">{u.admin ? "Admin (tudo)" : u.paginas.length ? u.paginas.length + " tela(s)" : "nenhuma"}</td>
              <td>
                <button className="icon-btn" title="Editar" onClick={() => editar(u)}>✎</button>
                <button className="icon-btn" title="Remover" onClick={() => remover(u)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
