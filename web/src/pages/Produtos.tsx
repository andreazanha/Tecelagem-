import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  type Produto,
  type RepAlerta,
  type FichaItem,
  type KitComponente,
  type ProdutoMov,
  type Insumo,
  type Fornecedor,
  type InsumoMov,
  type ProdutoLog,
  type ItemPedidoEstoque,
  type BaixaPreview,
  type Pedido,
} from "../api";

type Aba = "produtos" | "estoque" | "reposicao" | "entradas" | "ficha" | "insumos" | "historico";

const dt = (s?: string | null) => {
  if (!s) return "—";
  // datas vêm em UTC ("YYYY-MM-DD HH:MM:SS"); mostra em horário de Brasília.
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const nf = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

// "insumos" saiu (tela antiga, tabela `insumos`). A tela de materiais atual é
// Cadastros › Materiais (/cadastros?aba=materiais). Links antigos são redirecionados.
const ABAS_VALIDAS: Aba[] = ["produtos", "estoque", "reposicao", "entradas", "ficha", "historico"];

export function Produtos() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>(() => {
    const q = sp.get("aba") as Aba | null;
    if (q && ABAS_VALIDAS.includes(q)) return q;
    return (localStorage.getItem("produtos-aba") as Aba) || "produtos";
  });
  // atalhos do menu (?aba=ficha…) trocam a aba mesmo já montado.
  // ?aba=insumos é a tela antiga: manda pra tela de materiais atual.
  useEffect(() => {
    const q = sp.get("aba") as Aba | null;
    if (q === "insumos") { navigate("/cadastros?aba=materiais", { replace: true }); return; }
    if (q && ABAS_VALIDAS.includes(q)) setAba(q);
  }, [sp, navigate]);
  // contador de reposições pendentes (badge na aba)
  const [nRep, setNRep] = useState(0);
  useEffect(() => { api.listarReposicao().then((r) => setNRep(r.length)).catch(() => {}); }, [aba]);
  const abas: { id: Aba; label: string }[] = [
    { id: "produtos", label: "📦 Produtos" },
    { id: "estoque", label: "📊 Estoque" },
    { id: "reposicao", label: `⚠️ Reposição${nRep ? ` (${nRep})` : ""}` },
    { id: "entradas", label: "⬇️ Entradas" },
    { id: "ficha", label: "🧵 Ficha Técnica" },
    { id: "historico", label: "🕑 Histórico" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <div className="breadcrumb">Cadastro &amp; Estoque › {abas.find((a) => a.id === aba)?.label.replace(/^\S+\s/, "")}</div>
        </div>
      </div>

      {aba === "produtos" && <AbaProdutos />}
      {aba === "estoque" && <AbaEstoque />}
      {aba === "reposicao" && <AbaReposicao />}
      {aba === "entradas" && <AbaEntradas />}
      {aba === "ficha" && <AbaFicha />}
      {aba === "insumos" && <AbaInsumos />}
      {aba === "historico" && <AbaHistorico />}
    </>
  );
}

// ═══════════════════════════ Aba PRODUTOS ═══════════════════════════
const VAZIO: Partial<Produto> = { nome: "", ref: "", categoria: "", tamanho: "", cor: "", tipo_fio: "", unidade: "un", tipo: "avulso", estoque_min: 0, reposicao_qtd: 0, ativo: 1, observacao: "" };

function AbaProdutos() {
  const [itens, setItens] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(false);
  const [edit, setEdit] = useState<Partial<Produto> | null>(null);
  const [variacoes, setVariacoes] = useState(false);

  function recarregar() {
    api.listarProdutos({ ativo: soAtivos ? "1" : "todos", busca }).then(setItens).catch(() => {});
  }
  useEffect(recarregar, [soAtivos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(recarregar, 250);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ativar(p: Produto) {
    await api.ativarProduto(p.id, !p.ativo).catch((e) => alert((e as Error).message));
    recarregar();
  }
  async function excluir(p: Produto) {
    if (!confirm(`Excluir o produto "${p.nome}"? As movimentações ficam no histórico.`)) return;
    await api.excluirProduto(p.id).catch((e) => alert((e as Error).message));
    recarregar();
  }

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="busca-ped" placeholder="🔎 Nome, referência, categoria ou cor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="row-gap" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} /> só ativos
        </label>
        <button className="btn btn-soft" onClick={() => setVariacoes(true)} style={{ marginLeft: "auto" }} title="Cadastrar um produto em várias cores e/ou tamanhos de uma vez">🎨 Variações (cores/tamanhos)</button>
        <button className="btn btn-primary" onClick={() => setEdit({ ...VAZIO })}>
          ＋ Novo produto
        </button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th></th><th>Nome</th><th>Tipo</th><th>Ref</th><th>Categoria</th><th>Cor</th><th>Tamanho</th>
              <th className="num">Estoque</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={10} className="empty pad">Nenhum produto cadastrado.</td></tr>
            ) : (
              itens.map((p) => (
                <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                  <td>{p.foto_key ? <img src={`/api/produtos/${p.id}/foto`} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6 }} /> : <span className="muted">—</span>}</td>
                  <td className="strong">{p.nome}</td>
                  <td><span className="chip">{p.tipo === "kit" ? "🧩 Kit" : "Avulso"}</span></td>
                  <td>{p.ref || "—"}</td>
                  <td>{p.categoria || "—"}</td>
                  <td>{p.cor || "—"}</td>
                  <td>{p.tamanho || "—"}</td>
                  <td className="num strong">{nf(Number(p.estoque) || 0)} {p.unidade || ""}</td>
                  <td><span className={"status status-" + (p.ativo ? "conferido" : "pendente")}>{p.ativo ? "ativo" : "inativo"}</span></td>
                  <td>
                    <div className="row-gap" style={{ gap: 6 }}>
                      <button className="btn btn-soft" onClick={() => setEdit(p)}>✏️</button>
                      <button className="btn btn-soft" onClick={() => ativar(p)} title={p.ativo ? "Desativar" : "Ativar"}>{p.ativo ? "🚫" : "✅"}</button>
                      <button className="icon-btn" onClick={() => excluir(p)} title="Excluir">✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {variacoes && <ProdutoVariacoesModal onFechar={() => setVariacoes(false)} onSalvo={() => { setVariacoes(false); recarregar(); }} />}
      {edit && <ProdutoModal produto={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
    </>
  );
}

// Cadastro RÁPIDO de um produto em várias CORES e/ou TAMANHOS (cria a combinação).
function ProdutoVariacoesModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [ref, setRef] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [tipo, setTipo] = useState<"avulso" | "kit">("avulso");
  const [estMin, setEstMin] = useState(0);
  const [coresCat, setCoresCat] = useState<string[]>([]);
  const [cores, setCores] = useState<string[]>([]);
  const [novaCor, setNovaCor] = useState("");
  const [tamanhos, setTamanhos] = useState<string[]>([]);
  const [novoTam, setNovoTam] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [res, setRes] = useState<{ criados: { cor: string | null; tamanho: string | null }[]; pulados: number } | null>(null);

  useEffect(() => { api.listarCores().then((cs) => setCoresCat(cs.map((c) => c.nome))).catch(() => {}); }, []);

  const togCor = (c: string) => setCores((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  function addCor() { const n = novaCor.trim(); if (!n) return; setCores((s) => (s.includes(n) ? s : [...s, n])); setCoresCat((c) => (c.some((x) => x.toLowerCase() === n.toLowerCase()) ? c : [...c, n])); setNovaCor(""); }
  const togTam = (t: string) => setTamanhos((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  function addTam() { const n = novoTam.trim(); if (!n) return; setTamanhos((s) => (s.includes(n) ? s : [...s, n])); setNovoTam(""); }

  const totalCombos = (cores.length || 1) * (tamanhos.length || 1);
  async function salvar() {
    if (!nome.trim()) return setErro("Informe o nome do produto.");
    if (!cores.length && !tamanhos.length) return setErro("Escolha pelo menos uma cor ou um tamanho.");
    setSalvando(true); setErro("");
    try {
      const r = await api.cadastrarProdutosPorVariacoes({ nome: nome.trim(), ref, categoria, unidade, tipo, estoque_min: estMin, cores, tamanhos });
      setRes({ criados: r.criados, pulados: r.pulados });
    } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }

  const rotulo = (cor: string | null, tam: string | null) => [cor, tam].filter(Boolean).join(" · ") || "(sem variação)";

  if (res) {
    return (
      <div className="modal-bg" onClick={onSalvo}>
        <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">🎨 Variações de {nome}</span></span><button className="modal-x" onClick={onSalvo}>✕</button></div></div>
          <div className="pad">
            <p><strong>{res.criados.length}</strong> produto(s) criado(s).{res.pulados ? ` ${res.pulados} já existiam (não dupliquei).` : ""}</p>
            {res.criados.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{res.criados.map((v, k) => <span key={k} className="cor-chip on">{rotulo(v.cor, v.tamanho)}</span>)}</div>}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn btn-primary" onClick={onSalvo}>Concluir</button></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">🎨 Cadastro por variações</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <p className="muted" style={{ marginTop: 0 }}>Cria um produto por combinação de <strong>cor × tamanho</strong> — de uma vez. Os dados abaixo valem para todas as variações.</p>
          <div className="form-grid2">
            <Campo label="Nome do produto *"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Almofada Wave" /></Campo>
            <Campo label="Referência"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex.: 1075" /></Campo>
            <Campo label="Categoria"><input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Almofada, Manta…" /></Campo>
            <Campo label="Unidade"><input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un" /></Campo>
            <Campo label="Tipo"><select value={tipo} onChange={(e) => setTipo(e.target.value as "avulso" | "kit")}><option value="avulso">Avulso</option><option value="kit">Kit</option></select></Campo>
            <Campo label="Estoque mínimo (cada)"><input type="number" min={0} step="any" value={estMin} onChange={(e) => setEstMin(Number(e.target.value))} /></Campo>
          </div>

          <div style={{ marginTop: 4 }}>
            <div className="campo-l" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>CORES — {cores.length}</span>{cores.length > 0 && <button className="btn btn-soft" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setCores([])}>limpar</button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {coresCat.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>Nenhuma cor no cadastro — digite abaixo.</span>
                : coresCat.map((c) => <button key={c} type="button" onClick={() => togCor(c)} className={"cor-chip" + (cores.includes(c) ? " on" : "")}>{c}</button>)}
            </div>
            <div className="row-gap" style={{ gap: 6 }}>
              <input value={novaCor} onChange={(e) => setNovaCor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCor(); } }} placeholder="+ nova cor" style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={addCor}>Adicionar</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="campo-l" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>TAMANHOS — {tamanhos.length}</span>{tamanhos.length > 0 && <button className="btn btn-soft" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setTamanhos([])}>limpar</button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {["50X50", "45X45", "1.20X1.80", "70X250", "0.90X1.20"].map((t) => <button key={t} type="button" onClick={() => togTam(t)} className={"cor-chip" + (tamanhos.includes(t) ? " on" : "")}>{t}</button>)}
              {tamanhos.filter((t) => !["50X50", "45X45", "1.20X1.80", "70X250", "0.90X1.20"].includes(t)).map((t) => <button key={t} type="button" onClick={() => togTam(t)} className="cor-chip on">{t}</button>)}
            </div>
            <div className="row-gap" style={{ gap: 6 }}>
              <input value={novoTam} onChange={(e) => setNovoTam(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTam(); } }} placeholder="+ novo tamanho (ex.: 40X60)" style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={addTam}>Adicionar</button>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Vai criar <strong>{totalCombos}</strong> produto(s){cores.length && tamanhos.length ? ` (${cores.length} cor × ${tamanhos.length} tam)` : ""}.</p>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando || (!cores.length && !tamanhos.length)} onClick={salvar}>{salvando ? "Criando…" : `Criar ${totalCombos} produto(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProdutoModal({ produto, onFechar, onSalvo }: { produto: Partial<Produto>; onFechar: () => void; onSalvo: () => void }) {
  const [p, setP] = useState<Partial<Produto>>(produto);
  const [foto, setFoto] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [kitItens, setKitItens] = useState<KitComponente[]>([]);
  const [disp, setDisp] = useState<Produto[]>([]); // produtos que podem compor o kit
  const set = (patch: Partial<Produto>) => setP((o) => ({ ...o, ...patch }));

  useEffect(() => {
    api.listarProdutos({ ativo: "1" }).then((l) => setDisp(l.filter((x) => x.id !== p.id))).catch(() => {});
    if (p.id) api.obterProduto(p.id).then((full) => setKitItens(full.kit || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addKit = () => setKitItens((k) => [...k, { componente_id: null, nome: "", qtd: 1 }]);
  const setKit = (i: number, patch: Partial<KitComponente>) => setKitItens((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rmKit = (i: number) => setKitItens((k) => k.filter((_, j) => j !== i));
  function escolherComponente(i: number, prodId: string) {
    const prod = disp.find((x) => x.id === prodId);
    setKit(i, prod ? { componente_id: prodId, nome: prod.nome } : { componente_id: null });
  }

  async function salvar() {
    if (!p.nome?.trim()) return setErro("Informe o nome do produto.");
    if (p.tipo === "kit" && kitItens.filter((k) => k.nome.trim() && k.qtd > 0).length === 0)
      return setErro("Um kit precisa de pelo menos um produto na composição.");
    setSalvando(true);
    setErro("");
    try {
      const r = await api.salvarProduto(p);
      if (foto) await api.enviarFotoProduto(r.id, foto).catch(() => {});
      // composição do kit (limpa se virou avulso)
      await api.salvarKitComposicao(r.id, p.tipo === "kit" ? kitItens.filter((k) => k.nome.trim() && k.qtd > 0) : []);
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{p.id ? "Editar produto" : "Novo produto"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="form-grid2">
            <Campo label="Nome do produto *"><input value={p.nome || ""} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Almofada Aspen" /></Campo>
            <Campo label="Referência / código"><input value={p.ref || ""} onChange={(e) => set({ ref: e.target.value })} placeholder="1075" /></Campo>
            <Campo label="Categoria"><input value={p.categoria || ""} onChange={(e) => set({ categoria: e.target.value })} placeholder="Almofada, Manta…" /></Campo>
            <Campo label="Tamanho"><input value={p.tamanho || ""} onChange={(e) => set({ tamanho: e.target.value })} placeholder="50X50" /></Campo>
            <Campo label="Cor"><input value={p.cor || ""} onChange={(e) => set({ cor: e.target.value })} placeholder="ROMENIA" /></Campo>
            <Campo label="Tipo de fio"><input value={p.tipo_fio || ""} onChange={(e) => set({ tipo_fio: e.target.value })} placeholder="100% poliéster" /></Campo>
            <Campo label="Unidade de medida"><input value={p.unidade || ""} onChange={(e) => set({ unidade: e.target.value })} placeholder="un, pç, kg, m" /></Campo>
            <Campo label="Estoque mínimo"><input type="number" min={0} step="any" value={p.estoque_min ?? 0} onChange={(e) => set({ estoque_min: Number(e.target.value) })} placeholder="0 = sem alerta" /></Campo>
            <Campo label="Qtd. de reposição"><input type="number" min={0} step="any" value={p.reposicao_qtd ?? 0} onChange={(e) => set({ reposicao_qtd: Number(e.target.value) })} placeholder="quanto produzir ao faltar" /></Campo>
            <Campo label="Tipo de estoque">
              <select value={p.tipo || "avulso"} onChange={(e) => set({ tipo: e.target.value })}>
                <option value="avulso">Avulso (peça individual)</option>
                <option value="kit">Kit (junção de produtos)</option>
              </select>
            </Campo>
            <Campo label="Produto ativo?">
              <select value={p.ativo ? "1" : "0"} onChange={(e) => set({ ativo: e.target.value === "1" ? 1 : 0 })}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </Campo>
            <Campo label="Controla estoque (pronta-entrega)?">
              <select value={p.tipo === "kit" || Number(p.controla_estoque) === 1 ? "1" : "0"} disabled={p.tipo === "kit"} onChange={(e) => set({ controla_estoque: e.target.value === "1" ? 1 : 0 })}>
                <option value="1">Sim — aparece no estoque</option>
                <option value="0">Não — fora do estoque</option>
              </select>
            </Campo>
          </div>

          {p.tipo === "kit" && (
            <div style={{ marginTop: 6, marginBottom: 6, border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
              <div className="row-gap" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>🧩 Composição do kit</strong>
                <span className="muted" style={{ fontSize: 12 }}>quais produtos formam este kit</span>
              </div>
              <table className="table">
                <thead><tr><th>Produto (cadastro)</th><th>Nome</th><th className="num">Qtd</th><th></th></tr></thead>
                <tbody>
                  {kitItens.map((k, i) => (
                    <tr key={i}>
                      <td>
                        <select value={k.componente_id || ""} onChange={(e) => escolherComponente(i, e.target.value)}>
                          <option value="">— livre —</option>
                          {disp.map((prod) => <option key={prod.id} value={prod.id}>{prod.nome}{prod.ref ? ` · ${prod.ref}` : ""}</option>)}
                        </select>
                      </td>
                      <td><input value={k.nome} onChange={(e) => setKit(i, { nome: e.target.value })} placeholder="ex.: Peseira Aspen" /></td>
                      <td className="num"><input type="number" min={0} step="any" value={k.qtd} onChange={(e) => setKit(i, { qtd: Number(e.target.value) })} className="w-xs num" /></td>
                      <td><button className="icon-btn" onClick={() => rmKit(i)}>✕</button></td>
                    </tr>
                  ))}
                  {kitItens.length === 0 && <tr><td colSpan={4} className="empty pad">Sem componentes. Adicione abaixo.</td></tr>}
                </tbody>
              </table>
              <button className="btn btn-soft" style={{ marginTop: 6 }} onClick={addKit}>＋ Adicionar produto ao kit</button>
            </div>
          )}
          <Campo label="Foto do produto">
            <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
            {p.id && p.foto_key && !foto && (
              <div className="row-gap" style={{ marginTop: 6, alignItems: "center" }}>
                <img src={`/api/produtos/${p.id}/foto`} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />
                <button className="btn btn-soft" onClick={async () => { await api.removerFotoProduto(p.id!); set({ foto_key: null }); }}>Remover foto</button>
              </div>
            )}
          </Campo>
          <Campo label="Observações"><textarea value={p.observacao || ""} onChange={(e) => set({ observacao: e.target.value })} rows={2} /></Campo>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar produto"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba ESTOQUE ═══════════════════════════
function AbaEstoque() {
  const [itens, setItens] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [soFalta, setSoFalta] = useState(false);
  const [mov, setMov] = useState<Produto | null>(null);
  const [extrato, setExtrato] = useState<Produto | null>(null);
  const [selecionar, setSelecionar] = useState(false);
  const lista = soFalta ? itens.filter((p) => (Number(p.estoque) || 0) < (Number(p.estoque_min) || 0)) : itens;

  function recarregar() {
    api.listarProdutos({ ativo: "1", busca, estoque: "1" }).then(setItens).catch(() => {});
  }
  useEffect(recarregar, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(recarregar, 250); return () => clearTimeout(t); }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  async function tirar(p: Produto) {
    if (!confirm(`Tirar "${p.nome}" do estoque de pronta-entrega? (o produto continua no cadastro)`)) return;
    await api.toggleEstoqueProduto(p.id, false).catch(() => {});
    recarregar();
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>Só os produtos <strong>selecionados</strong> como pronta-entrega (e os kits) aparecem aqui. Clique em <strong>Movimentar</strong> para entrada/saída, ou no produto para ver o extrato.</p>
      <div className="row-gap" style={{ marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input className="busca-ped" placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="row-gap" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} /> só em falta
        </label>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setSelecionar(true)}>＋ Selecionar produtos</button>
        <a className="btn" href="/api/produtos/relatorio-estoque/pdf" target="_blank" rel="noreferrer">
          📄 Relatório PDF
        </a>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Produto</th><th>Ref</th><th>Cor</th><th>Tamanho</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Situação</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={8} className="empty pad">Nenhum produto.</td></tr>
            ) : (
              lista.map((p) => {
                const est = Number(p.estoque) || 0, mn = Number(p.estoque_min) || 0, saldo = est - mn;
                const falta = saldo < 0, sobra = mn > 0 && saldo > 0;
                return (
                  <tr key={p.id} className={falta ? "prod-falta" : undefined}>
                    <td className="strong link" style={{ cursor: "pointer" }} onClick={() => setExtrato(p)}>{p.nome}</td>
                    <td>{p.ref || "—"}</td>
                    <td>{p.cor || "—"}</td>
                    <td>{p.tamanho || "—"}</td>
                    <td className="num strong">{nf(est)} {p.unidade || ""}</td>
                    <td className="num">{mn ? nf(mn) : "—"}</td>
                    <td>
                      {falta ? <span className="status status-pendente">⚠ falta {nf(-saldo)}</span>
                        : sobra ? <span className="chip" style={{ color: "#1d4ed8" }}>sobra +{nf(saldo)}</span>
                          : <span className="status status-conferido">ok</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-soft" onClick={() => setMov(p)}>Movimentar</button>
                      {p.tipo !== "kit" && <button className="btn btn-soft" title="Tirar do estoque" style={{ marginLeft: 6 }} onClick={() => tirar(p)}>✕</button>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {mov && <MovModal alvo="produto" id={mov.id} nome={mov.nome} unidade={mov.unidade || "un"} onFechar={() => setMov(null)} onFeito={() => { setMov(null); recarregar(); }} />}
      {extrato && <ExtratoModal alvo="produto" id={extrato.id} nome={extrato.nome} onFechar={() => setExtrato(null)} />}
      {selecionar && <SelecionarEstoque onFechar={() => setSelecionar(false)} onFeito={() => { setSelecionar(false); recarregar(); }} />}
    </>
  );
}

// Selecionar quais produtos fazem parte do estoque de pronta-entrega.
function SelecionarEstoque({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => void }) {
  const [todos, setTodos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.listarProdutos({ ativo: "1" }).then(setTodos).catch(() => {}); }, []);

  const q = busca.trim().toLowerCase();
  const lista = q ? todos.filter((p) => `${p.nome} ${p.ref || ""} ${p.cor || ""}`.toLowerCase().includes(q)) : todos;

  async function toggle(p: Produto) {
    if (p.tipo === "kit") return; // kit é sempre pronta-entrega
    const on = !(Number(p.controla_estoque) === 1);
    setTodos((ts) => ts.map((x) => (x.id === p.id ? { ...x, controla_estoque: on ? 1 : 0 } : x)));
    setSalvando(true);
    try { await api.toggleEstoqueProduto(p.id, on); } catch { /* revert on error */ setTodos((ts) => ts.map((x) => (x.id === p.id ? { ...x, controla_estoque: on ? 0 : 1 } : x))); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#0ea5e9,#2563eb)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Produtos no estoque de pronta-entrega</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <input className="busca-ped" style={{ width: "100%", marginBottom: 10 }} placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
            <table className="table">
              <tbody>
                {lista.map((p) => {
                  const on = p.tipo === "kit" || Number(p.controla_estoque) === 1;
                  return (
                    <tr key={p.id} onClick={() => toggle(p)} style={{ cursor: p.tipo === "kit" ? "default" : "pointer" }}>
                      <td style={{ width: 34 }}><input type="checkbox" checked={on} disabled={p.tipo === "kit"} readOnly /></td>
                      <td className="strong">{p.nome}{p.tipo === "kit" && <span className="chip" style={{ marginLeft: 6 }}>🧩 kit</span>}</td>
                      <td className="muted">{[p.cor, p.tamanho].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
                {lista.length === 0 && <tr><td className="empty pad">Nenhum produto.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-ft">
          <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>{salvando ? "Salvando…" : "Marque os que ficam no estoque. Kits entram automático."}</span>
          <button className="kbtn go" onClick={onFeito}>Concluir</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba REPOSIÇÃO ═══════════════════════════
function AbaReposicao() {
  const [itens, setItens] = useState<RepAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState("");

  function recarregar() {
    setCarregando(true);
    api.listarReposicao().then(setItens).catch(() => {}).finally(() => setCarregando(false));
  }
  useEffect(recarregar, []);

  async function aprovar(a: RepAlerta) {
    setOcupado(a.id);
    try {
      const r = await api.aprovarReposicao(a.id);
      alert(`Reposição ${r.numero} aprovada — ${a.produto_nome} liberado para produção.`);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado("");
    }
  }
  async function ignorar(a: RepAlerta) {
    if (!confirm(`Cancelar a reposição de ${a.produto_nome}? O pedido montado será descartado.`)) return;
    await api.ignorarReposicao(a.id).catch(() => {});
    recarregar();
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Quando um produto atinge o <strong>estoque mínimo</strong>, o sistema já <strong>monta o pedido de reposição</strong> automaticamente (na quantidade necessária) — mas ele só entra na produção depois que você <strong>aprovar</strong>. Se o estoque continuar caindo enquanto a aprovação não sai, a quantidade do pedido é <strong>atualizada sozinha</strong>. Defina o mínimo e a quantidade de reposição no cadastro do produto.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Produto</th><th>Ref</th><th>Cor · Tam</th><th>Pedido</th><th className="num">Estoque</th><th className="num">Mínimo</th><th className="num">Produzir</th><th></th></tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={8} className="empty pad">Carregando…</td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={8} className="empty pad">Nenhuma reposição aguardando aprovação. 👍</td></tr>
            ) : itens.map((a) => (
              <tr key={a.id} style={{ background: "#fff7ed", color: "#7c2d12" }}>
                <td className="strong">{a.produto_nome}</td>
                <td>{a.ref || "—"}</td>
                <td>{a.cor || "—"}{a.tamanho ? ` · ${a.tamanho}` : ""}</td>
                <td>{a.pedido_numero || "—"}</td>
                <td className="num strong" style={{ color: "#b91c1c" }}>{nf(Number(a.estoque) || 0)} {a.unidade || ""}</td>
                <td className="num">{nf(a.estoque_min)}</td>
                <td className="num strong">{nf(a.qtd_sugerida)}</td>
                <td>
                  <div className="row-gap" style={{ gap: 6 }}>
                    <button className="btn btn-primary" disabled={!!ocupado} onClick={() => aprovar(a)}>{ocupado === a.id ? "…" : "Aprovar"}</button>
                    <button className="btn btn-soft" onClick={() => ignorar(a)}>Cancelar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Modal de movimentação (serve para produto e insumo).
function MovModal({ alvo, id, nome, unidade, onFechar, onFeito }: { alvo: "produto" | "insumo"; id: string; nome: string; unidade: string; onFechar: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [origem, setOrigem] = useState<"avulsa" | "ajuste">("avulsa");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    const q = Number(qtd.replace(",", "."));
    if (!(q > 0)) return setErro("Informe uma quantidade maior que zero.");
    setSalvando(true);
    setErro("");
    try {
      const body = { tipo, origem, qtd: q, observacao: obs };
      if (alvo === "produto") await api.movProduto(id, body);
      else await api.movInsumo(id, body);
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">Movimentar — {nome}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="segmented" style={{ marginBottom: 10 }}>
            <button className={"seg" + (tipo === "entrada" ? " seg-on" : "")} onClick={() => setTipo("entrada")}>⬇️ Entrada</button>
            <button className={"seg" + (tipo === "saida" ? " seg-on" : "")} onClick={() => setTipo("saida")}>⬆️ Saída</button>
          </div>
          <div className="form-grid2">
            <Campo label={`Quantidade (${unidade})`}><input type="number" min={0} step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} autoFocus /></Campo>
            <Campo label="Tipo de lançamento">
              <select value={origem} onChange={(e) => setOrigem(e.target.value as "avulsa" | "ajuste")}>
                <option value="avulsa">Avulsa</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </Campo>
          </div>
          <Campo label="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="motivo, nota…" /></Campo>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={confirmar}>{salvando ? "…" : "Confirmar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtratoModal({ alvo, id, nome, onFechar }: { alvo: "produto" | "insumo"; id: string; nome: string; onFechar: () => void }) {
  const [movs, setMovs] = useState<(ProdutoMov | InsumoMov)[]>([]);
  useEffect(() => {
    (alvo === "produto" ? api.movsProduto(id) : api.movsInsumo(id)).then(setMovs).catch(() => {});
  }, [alvo, id]);
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">Extrato — {nome}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          <table className="table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th className="num">Qtd</th><th>Usuário</th></tr></thead>
            <tbody>
              {movs.length === 0 ? (
                <tr><td colSpan={5} className="empty pad">Sem movimentações.</td></tr>
              ) : movs.map((m) => (
                <tr key={m.id}>
                  <td>{dt(m.criado_em)}</td>
                  <td><span className={"status status-" + (m.tipo === "entrada" ? "conferido" : "pendente")}>{m.tipo}</span></td>
                  <td>{m.origem}</td>
                  <td className="num strong">{m.tipo === "entrada" ? "+" : "−"}{nf(m.qtd)}</td>
                  <td>{m.usuario || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba ENTRADAS ═══════════════════════════
function AbaEntradas() {
  const [movs, setMovs] = useState<ProdutoMov[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movAvulsa, setMovAvulsa] = useState<Produto | null>(null);
  const [porPedido, setPorPedido] = useState(false);
  const [baixa, setBaixa] = useState<ProdutoMov | null>(null);
  const [escolher, setEscolher] = useState(false);

  function recarregar() {
    api.listarMovimentacoes().then(setMovs).catch(() => {});
    api.listarProdutos({ ativo: "1" }).then(setProdutos).catch(() => {});
  }
  useEffect(recarregar, []);

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setEscolher(true)}>＋ Entrada avulsa</button>
        <button className="btn btn-soft" onClick={() => setPorPedido(true)}>📦 Entrada por pedido</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Origem</th><th className="num">Qtd</th><th>Pedido</th><th>Usuário</th><th></th></tr>
          </thead>
          <tbody>
            {movs.length === 0 ? (
              <tr><td colSpan={8} className="empty pad">Nenhuma movimentação.</td></tr>
            ) : movs.map((m) => (
              <tr key={m.id}>
                <td>{dt(m.criado_em)}</td>
                <td className="strong">{m.produto_nome || "—"}</td>
                <td><span className={"status status-" + (m.tipo === "entrada" ? "conferido" : "pendente")}>{m.tipo}</span></td>
                <td>{m.origem}</td>
                <td className="num strong">{m.tipo === "entrada" ? "+" : "−"}{nf(m.qtd)} {m.produto_unidade || ""}</td>
                <td>{m.pedido_numero || "—"}</td>
                <td>{m.usuario || "—"}</td>
                <td>
                  {m.tipo === "entrada" && (
                    m.insumos_baixados ? <span className="muted" style={{ fontSize: 12 }}>materiais baixados ✓</span>
                      : <button className="btn btn-soft" onClick={() => setBaixa(m)}>Baixar materiais</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {escolher && <EscolherProdutoModal produtos={produtos} onFechar={() => setEscolher(false)} onEscolher={(p) => { setEscolher(false); setMovAvulsa(p); }} />}
      {movAvulsa && <MovModal alvo="produto" id={movAvulsa.id} nome={movAvulsa.nome} unidade={movAvulsa.unidade || "un"} onFechar={() => setMovAvulsa(null)} onFeito={() => { setMovAvulsa(null); recarregar(); }} />}
      {porPedido && <EntradaPedidoModal onFechar={() => setPorPedido(false)} onFeito={() => { setPorPedido(false); recarregar(); }} />}
      {baixa && <BaixaInsumosModal mov={baixa} onFechar={() => setBaixa(null)} onFeito={() => { setBaixa(null); recarregar(); }} />}
    </>
  );
}

function EscolherProdutoModal({ produtos, onFechar, onEscolher }: { produtos: Produto[]; onFechar: () => void; onEscolher: (p: Produto) => void }) {
  const [q, setQ] = useState("");
  const lista = q ? produtos.filter((p) => `${p.nome} ${p.ref || ""}`.toLowerCase().includes(q.toLowerCase())) : produtos;
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Escolher produto</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          <input className="busca-ped" placeholder="🔎 Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {lista.map((p) => (
              <button key={p.id} className="btn btn-soft" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6 }} onClick={() => onEscolher(p)}>
                <strong>{p.nome}</strong> {p.ref ? `· ${p.ref}` : ""} — estoque {nf(Number(p.estoque) || 0)} {p.unidade}
              </button>
            ))}
            {lista.length === 0 && <p className="muted">Nenhum produto ativo. Cadastre na aba Produtos.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function EntradaPedidoModal({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoId, setPedidoId] = useState("");
  const [itens, setItens] = useState<ItemPedidoEstoque[]>([]);
  const [numero, setNumero] = useState("");
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [cadastrando, setCadastrando] = useState(false);
  useEffect(() => { api.listarPedidos().then(setPedidos).catch(() => {}); }, []);
  function carregar() {
    if (!pedidoId) { setItens([]); return; }
    api.itensPedidoParaEstoque(pedidoId).then((r) => {
      setNumero(r.pedido.numero);
      setItens(r.itens);
      const s: Record<number, boolean> = {};
      r.itens.forEach((it, i) => (s[i] = !!it.produto_id));
      setSel(s);
    }).catch((e) => setErro((e as Error).message));
  }
  useEffect(carregar, [pedidoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const semVinc = itens.filter((it) => !it.produto_id).length;
  async function cadastrarFaltantes() {
    setCadastrando(true);
    try {
      const r = await api.cadastrarProdutosDoPedido(pedidoId);
      carregar(); // re-casa os itens (agora com os produtos criados)
      if (!r.criados) setErro("Todos os itens já tinham produto cadastrado.");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCadastrando(false);
    }
  }

  async function confirmar() {
    const escolhidos = itens
      .map((it, i) => ({ it, i }))
      .filter(({ it, i }) => sel[i] && it.produto_id && it.qtd > 0)
      .map(({ it }) => ({ produto_id: it.produto_id!, qtd: it.qtd }));
    if (!escolhidos.length) return setErro("Selecione ao menos um item com produto vinculado.");
    setSalvando(true);
    setErro("");
    try {
      await api.entradaPorPedido({ pedido_id: pedidoId, pedido_numero: numero, itens: escolhidos });
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Entrada por pedido</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <Campo label="Pedido">
            <select value={pedidoId} onChange={(e) => setPedidoId(e.target.value)}>
              <option value="">Escolha um pedido…</option>
              {pedidos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo_pai || p.numero_erp || p.id.slice(0, 8)} — {p.cliente_nome}</option>
              ))}
            </select>
          </Campo>
          {itens.length > 0 && (
            <>
              <div className="row-gap" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>Itens casados por referência.{semVinc > 0 ? ` ${semVinc} sem produto no estoque.` : ""}</p>
                {semVinc > 0 && (
                  <button className="btn btn-soft" disabled={cadastrando} onClick={cadastrarFaltantes}>
                    {cadastrando ? "Cadastrando…" : `＋ Cadastrar ${semVinc} produto(s) que faltam`}
                  </button>
                )}
              </div>
              <table className="table">
                <thead><tr><th></th><th>Item do pedido</th><th>Produto no estoque</th><th className="num">Qtd</th></tr></thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={i} style={{ opacity: it.produto_id ? 1 : 0.55 }}>
                      <td><input type="checkbox" disabled={!it.produto_id} checked={!!sel[i]} onChange={(e) => setSel((s) => ({ ...s, [i]: e.target.checked }))} /></td>
                      <td>{it.produto} {it.ref ? `· ${it.ref}` : ""} {it.cor ? `· ${it.cor}` : ""} {it.tamanho ? `· ${it.tamanho}` : ""}</td>
                      <td>{it.produto_nome ? <span className="strong">{it.produto_nome}</span> : <span className="muted">sem vínculo</span>}</td>
                      <td className="num strong">{nf(it.qtd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando || !itens.length} onClick={confirmar}>{salvando ? "…" : "Lançar no estoque"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BaixaInsumosModal({ mov, onFechar, onFeito }: { mov: ProdutoMov; onFechar: () => void; onFeito: () => void }) {
  const [prev, setPrev] = useState<BaixaPreview | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.baixaPreview(mov.id).then(setPrev).catch((e) => setErro((e as Error).message)); }, [mov.id]);

  async function confirmar() {
    setSalvando(true);
    setErro("");
    try {
      await api.baixarInsumos(mov.id);
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  const temVinculo = (prev?.linhas || []).some((l) => l.vinculado);
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Baixar materiais desta entrada</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <p className="muted" style={{ marginTop: 0 }}>
            {mov.produto_nome} · entrada de <strong>{nf(mov.qtd)}</strong>. Confira o que será baixado do estoque de materiais:
          </p>
          <table className="table">
            <thead><tr><th>Material</th><th className="num">Por unid.</th><th className="num">Total</th><th className="num">Estoque</th></tr></thead>
            <tbody>
              {(prev?.linhas || []).length === 0 ? (
                <tr><td colSpan={4} className="empty pad">Este produto não tem ficha técnica. Cadastre na aba Ficha Técnica.</td></tr>
              ) : prev!.linhas.map((l, i) => (
                <tr key={i} style={{ opacity: l.vinculado ? 1 : 0.5 }}>
                  <td className="strong">{l.nome} {!l.vinculado && <span className="muted" style={{ fontSize: 11 }}>(sem vínculo — não baixa)</span>}</td>
                  <td className="num">{nf(l.qtd_por_unidade)} {l.unidade || ""}</td>
                  <td className="num strong">{nf(l.qtd_total)} {l.unidade || ""}</td>
                  <td className="num">{l.estoque_atual == null ? "—" : nf(l.estoque_atual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando || !temVinculo} onClick={confirmar} title={temVinculo ? "" : "Vincule os materiais da ficha ao cadastro de materiais para baixar"}>
              {salvando ? "…" : "Confirmar baixa"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba FICHA TÉCNICA ═══════════════════════════
function AbaFicha() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [pid, setPid] = useState("");
  const [linhas, setLinhas] = useState<FichaItem[]>([]);
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.listarProdutos({ ativo: "1" }).then(setProdutos).catch(() => {});
    api.listarInsumos({ ativo: "1" }).then(setInsumos).catch(() => {});
  }, []);
  useEffect(() => {
    if (!pid) { setLinhas([]); return; }
    api.obterProduto(pid).then((p) => setLinhas(p.ficha || [])).catch(() => {});
  }, [pid]);

  const add = () => setLinhas((l) => [...l, { nome: "", tipo: "", qtd_por_unidade: 1, unidade: "un", observacao: "", insumo_id: null }]);
  const setLinha = (i: number, patch: Partial<FichaItem>) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const rm = (i: number) => setLinhas((l) => l.filter((_, j) => j !== i));

  async function salvar() {
    setSalvando(true);
    setMsg("");
    try {
      const r = await api.salvarFicha(pid, linhas.filter((l) => l.nome.trim()));
      setMsg(`Ficha salva (${r.total} material(is)).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  // Ao escolher um insumo cadastrado, puxa nome/unidade automaticamente.
  function escolherInsumo(i: number, insumoId: string) {
    const ins = insumos.find((x) => x.id === insumoId);
    if (ins) setLinha(i, { insumo_id: insumoId, nome: ins.nome, unidade: ins.unidade || "un", tipo: ins.categoria || "" });
    else setLinha(i, { insumo_id: null });
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Especifique os materiais usados por <strong>unidade</strong> do produto. Vincule ao cadastro de materiais para a baixa automática funcionar.
      </p>
      <div className="row-gap" style={{ marginBottom: 12 }}>
        <Campo label="Produto">
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Escolha um produto…</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} {p.ref ? `· ${p.ref}` : ""}</option>)}
          </select>
        </Campo>
      </div>
      {pid && (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Material (cadastro)</th><th>Nome</th><th>Tipo</th><th className="num">Qtd/unid.</th><th>Unidade</th><th>Obs.</th><th></th></tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.insumo_id || ""} onChange={(e) => escolherInsumo(i, e.target.value)}>
                      <option value="">— livre —</option>
                      {insumos.map((ins) => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
                    </select>
                  </td>
                  <td><input value={l.nome} onChange={(e) => setLinha(i, { nome: e.target.value })} placeholder="ex.: Zíper" /></td>
                  <td><input value={l.tipo || ""} onChange={(e) => setLinha(i, { tipo: e.target.value })} placeholder="etiqueta, fio…" className="w-sm" /></td>
                  <td className="num"><input type="number" min={0} step="any" value={l.qtd_por_unidade} onChange={(e) => setLinha(i, { qtd_por_unidade: Number(e.target.value) })} className="w-xs num" /></td>
                  <td><input value={l.unidade || ""} onChange={(e) => setLinha(i, { unidade: e.target.value })} className="w-sm" placeholder="un, g, m" /></td>
                  <td><input value={l.observacao || ""} onChange={(e) => setLinha(i, { observacao: e.target.value })} /></td>
                  <td><button className="icon-btn" onClick={() => rm(i)}>✕</button></td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td colSpan={7} className="empty pad">Sem insumos. Adicione abaixo.</td></tr>}
            </tbody>
          </table>
          <div className="row-gap" style={{ padding: 12, justifyContent: "space-between" }}>
            <button className="btn btn-soft" onClick={add}>＋ Adicionar insumo</button>
            <div className="row-gap" style={{ alignItems: "center", gap: 10 }}>
              {msg && <span className="muted">{msg}</span>}
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar ficha técnica"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════ Aba INSUMOS ═══════════════════════════
const INSUMO_VAZIO: Partial<Insumo> = { nome: "", categoria: "", unidade: "un", codigo: "", estoque_min: 0, ativo: 1, observacao: "" };

function AbaInsumos() {
  const [itens, setItens] = useState<Insumo[]>([]);
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<Partial<Insumo> | null>(null);
  const [mov, setMov] = useState<Insumo | null>(null);
  const [extrato, setExtrato] = useState<Insumo | null>(null);
  const [cores, setCores] = useState(false);
  const [listas, setListas] = useState(false);

  function recarregar() { api.listarInsumos({ busca }).then(setItens).catch(() => {}); }
  useEffect(recarregar, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(recarregar, 250); return () => clearTimeout(t); }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(i: Insumo) {
    if (!confirm(`Excluir o material "${i.nome}"?`)) return;
    await api.excluirInsumo(i.id).catch((e) => alert((e as Error).message));
    recarregar();
  }

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, alignItems: "center" }}>
        <input className="busca-ped" placeholder="🔎 Nome, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-soft" onClick={() => setListas(true)} style={{ marginLeft: "auto" }} title="Gerenciar as categorias e cores próprias dos materiais">🗂️ Categorias e cores</button>
        <button className="btn btn-soft" onClick={() => setCores(true)} title="Cadastrar um material em várias cores de uma vez (ex.: Zíper em Preto, Branco, Vermelho…)">🎨 Cadastro por cores</button>
        <button className="btn btn-primary" onClick={() => setEdit({ ...INSUMO_VAZIO })}>＋ Novo material</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Nome</th><th>Categoria</th><th>Cor</th><th>Código</th><th>Fornecedor</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={9} className="empty pad">Nenhum material cadastrado.</td></tr>
            ) : itens.map((i) => {
              const baixo = (Number(i.estoque) || 0) <= (Number(i.estoque_min) || 0) && (Number(i.estoque_min) || 0) > 0;
              return (
                <tr key={i.id} style={{ opacity: i.ativo ? 1 : 0.5 }}>
                  <td className="strong link" style={{ cursor: "pointer" }} onClick={() => setExtrato(i)}>{i.nome}</td>
                  <td>{i.categoria || "—"}</td>
                  <td>{i.cor || "—"}</td>
                  <td>{i.codigo || "—"}</td>
                  <td>{i.fornecedor_nome || "—"}</td>
                  <td className="num strong" style={baixo ? { color: "#b91c1c" } : undefined}>{nf(Number(i.estoque) || 0)} {i.unidade} {baixo ? "⚠️" : ""}</td>
                  <td className="num">{nf(Number(i.estoque_min) || 0)}</td>
                  <td><span className={"status status-" + (i.ativo ? "conferido" : "pendente")}>{i.ativo ? "ativo" : "inativo"}</span></td>
                  <td>
                    <div className="row-gap" style={{ gap: 6 }}>
                      <button className="btn btn-soft" onClick={() => setMov(i)}>Mov.</button>
                      <button className="btn btn-soft" onClick={() => setEdit(i)}>✏️</button>
                      <button className="icon-btn" onClick={() => excluir(i)}>✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {listas && <ListasInsumoModal onFechar={() => setListas(false)} />}
      {cores && <InsumoCoresModal onFechar={() => setCores(false)} onSalvo={() => { setCores(false); recarregar(); }} />}
      {edit && <InsumoModal insumo={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
      {mov && <MovModal alvo="insumo" id={mov.id} nome={mov.nome} unidade={mov.unidade || "un"} onFechar={() => setMov(null)} onFeito={() => { setMov(null); recarregar(); }} />}
      {extrato && <ExtratoModal alvo="insumo" id={extrato.id} nome={extrato.nome} onFechar={() => setExtrato(null)} />}
    </>
  );
}

// Gerenciar as listas próprias de insumo: categorias, cores e fornecedores.
function ListasInsumoModal({ onFechar }: { onFechar: () => void }) {
  const [aba, setAba] = useState<"categorias" | "cores" | "fornecedores">("categorias");
  const [cats, setCats] = useState<string[]>([]);
  const [cores, setCores] = useState<string[]>([]);
  const [forns, setForns] = useState<Fornecedor[]>([]);
  const [novo, setNovo] = useState("");

  function carregar() {
    api.listarInsumoCategorias().then((l) => setCats(l.map((x) => x.nome))).catch(() => {});
    api.listarInsumoCores().then((l) => setCores(l.map((x) => x.nome))).catch(() => {});
    api.listarFornecedores().then(setForns).catch(() => {});
  }
  useEffect(carregar, []);

  async function add() {
    const n = novo.trim();
    if (!n) return;
    try {
      if (aba === "categorias") await api.addInsumoCategoria(n);
      else if (aba === "cores") await api.addInsumoCor(n);
      else await api.salvarFornecedor({ nome: n });
      setNovo("");
      carregar();
    } catch (e) { alert((e as Error).message); }
  }
  async function del(nomeOuId: string, label: string) {
    if (!confirm(`Excluir "${label}"?`)) return;
    try {
      if (aba === "categorias") await api.excluirInsumoCategoria(nomeOuId);
      else if (aba === "cores") await api.excluirInsumoCor(nomeOuId);
      else await api.excluirFornecedor(nomeOuId);
      carregar();
    } catch (e) { alert((e as Error).message); }
  }

  const abas: { id: typeof aba; label: string }[] = [
    { id: "categorias", label: "🗂️ Categorias" },
    { id: "cores", label: "🎨 Cores" },
    { id: "fornecedores", label: "🚚 Fornecedores" },
  ];
  const lista = aba === "categorias" ? cats : aba === "cores" ? cores : forns.map((f) => f.nome);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Listas do material</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          <div className="segmented" style={{ marginBottom: 14 }}>
            {abas.map((a) => <button key={a.id} type="button" className={"seg" + (aba === a.id ? " seg-on" : "")} onClick={() => setAba(a.id)}>{a.label}</button>)}
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {aba === "cores" ? "Cores próprias dos materiais (separadas das cores de produto)." : aba === "categorias" ? "Categorias de materiais (viram opção no cadastro)." : "Fornecedores (para vincular ao material e futura ordem de compra)."}
          </p>
          <div className="row-gap" style={{ gap: 6, marginBottom: 12 }}>
            <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={aba === "fornecedores" ? "Nome do fornecedor" : "Nome da " + (aba === "cores" ? "cor" : "categoria")} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={add}>＋ Adicionar</button>
          </div>
          {lista.length === 0 ? (
            <p className="muted">Nada cadastrado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflow: "auto" }}>
              {aba === "fornecedores"
                ? forns.map((f) => (
                    <div key={f.id} className="lista-row"><span>{f.nome}{f.telefone ? <span className="muted"> · {f.telefone}</span> : null}</span><button className="btn btn-soft" style={{ color: "#b91c1c" }} onClick={() => del(f.id, f.nome)}>🗑</button></div>
                  ))
                : (lista as string[]).map((n) => (
                    <div key={n} className="lista-row"><span>{n}</span><button className="btn btn-soft" style={{ color: "#b91c1c" }} onClick={() => del(n, n)}>🗑</button></div>
                  ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsumoModal({ insumo, onFechar, onSalvo }: { insumo: Partial<Insumo>; onFechar: () => void; onSalvo: () => void }) {
  const [i, setI] = useState<Partial<Insumo>>(insumo);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [cats, setCats] = useState<string[]>([]);
  const [cores, setCores] = useState<string[]>([]);
  const [forns, setForns] = useState<Fornecedor[]>([]);
  const set = (patch: Partial<Insumo>) => setI((o) => ({ ...o, ...patch }));

  function carregarListas() {
    api.listarInsumoCategorias().then((l) => setCats(l.map((x) => x.nome))).catch(() => {});
    api.listarInsumoCores().then((l) => setCores(l.map((x) => x.nome))).catch(() => {});
    api.listarFornecedores().then(setForns).catch(() => {});
  }
  useEffect(carregarListas, []);

  async function novoFornecedor() {
    const nome = prompt("Nome do novo fornecedor:");
    if (!nome?.trim()) return;
    try { const f = await api.salvarFornecedor({ nome: nome.trim() }); await api.listarFornecedores().then(setForns); set({ fornecedor_id: f.id }); }
    catch (e) { alert((e as Error).message); }
  }

  async function salvar() {
    if (!i.nome?.trim()) return setErro("Informe o nome do material.");
    setSalvando(true);
    setErro("");
    try {
      // categoria/cor digitadas que ainda não existem → registra na lista própria
      const cat = (i.categoria || "").trim(); const cor = (i.cor || "").trim();
      if (cat && !cats.some((x) => x.toLowerCase() === cat.toLowerCase())) await api.addInsumoCategoria(cat).catch(() => {});
      if (cor && !cores.some((x) => x.toLowerCase() === cor.toLowerCase())) await api.addInsumoCor(cor).catch(() => {});
      await api.salvarInsumo(i);
      onSalvo();
    } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">{i.id ? "Editar material" : "Novo material"}</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="form-grid2">
            <Campo label="Nome do material *"><input value={i.nome || ""} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Zíper 50cm" /></Campo>
            <Campo label="Categoria">
              <input list="ins-cats" value={i.categoria || ""} onChange={(e) => set({ categoria: e.target.value })} placeholder="Aviamento, Zíper…" />
              <datalist id="ins-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </Campo>
            <Campo label="Cor (do material)">
              <input list="ins-cores" value={i.cor || ""} onChange={(e) => set({ cor: e.target.value })} placeholder="Preto, Marinho…" />
              <datalist id="ins-cores">{cores.map((c) => <option key={c} value={c} />)}</datalist>
            </Campo>
            <Campo label="Código"><input value={i.codigo || ""} onChange={(e) => set({ codigo: e.target.value })} placeholder="ex.: ZIP50-PRETO" /></Campo>
            <Campo label="Medida (unidade)"><input value={i.unidade || ""} onChange={(e) => set({ unidade: e.target.value })} placeholder="un, m, cm, g, kg" /></Campo>
            <Campo label="Estoque mínimo"><input type="number" min={0} step="any" value={i.estoque_min ?? 0} onChange={(e) => set({ estoque_min: Number(e.target.value) })} /></Campo>
            <Campo label="Fornecedor">
              <div className="row-gap" style={{ gap: 6 }}>
                <select value={i.fornecedor_id || ""} onChange={(e) => set({ fornecedor_id: e.target.value || null })} style={{ flex: 1 }}>
                  <option value="">— sem fornecedor —</option>
                  {forns.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <button className="btn btn-soft" type="button" onClick={novoFornecedor} title="Cadastrar novo fornecedor">＋</button>
              </div>
            </Campo>
            <Campo label="Ativo?">
              <select value={i.ativo ? "1" : "0"} onChange={(e) => set({ ativo: e.target.value === "1" ? 1 : 0 })}>
                <option value="1">Ativo</option><option value="0">Inativo</option>
              </select>
            </Campo>
          </div>
          <Campo label="Observações"><textarea value={i.observacao || ""} onChange={(e) => set({ observacao: e.target.value })} rows={2} /></Campo>
          {i.id && <p className="muted" style={{ fontSize: 12 }}>Estoque atual: <strong>{nf(Number(i.estoque) || 0)} {i.unidade}</strong> (movimente pelo botão “Mov.” na lista).</p>}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar insumo"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cadastro RÁPIDO de um insumo em várias cores (ex.: Zíper Preto, Branco, Vermelho…).
function InsumoCoresModal({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [base, setBase] = useState("Zíper");
  const [categoria, setCategoria] = useState("Aviamento");
  const [unidade, setUnidade] = useState("un");
  const [estMin, setEstMin] = useState(0);
  const [codigo, setCodigo] = useState("");
  const [coresCat, setCoresCat] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [res, setRes] = useState<{ criados: { nome: string; cor: string }[]; pulados: number } | null>(null);

  useEffect(() => { api.listarInsumoCores().then((cs) => setCoresCat(cs.map((c) => c.nome))).catch(() => {}); }, []);

  const toggle = (cor: string) => setSel((s) => (s.includes(cor) ? s.filter((x) => x !== cor) : [...s, cor]));
  function addNova() {
    const n = nova.trim();
    if (!n) return;
    setSel((s) => (s.includes(n) ? s : [...s, n]));
    setCoresCat((c) => (c.some((x) => x.toLowerCase() === n.toLowerCase()) ? c : [...c, n]));
    api.addInsumoCor(n).catch(() => {}); // registra a cor na lista própria de insumos
    setNova("");
  }
  async function salvar() {
    if (!base.trim()) return setErro("Informe o nome-base (ex.: Zíper).");
    if (!sel.length) return setErro("Selecione ao menos uma cor.");
    setSalvando(true); setErro("");
    try {
      const r = await api.cadastrarInsumosPorCores({ base: base.trim(), cores: sel, categoria, unidade, estoque_min: estMin, codigo });
      setRes({ criados: r.criados, pulados: r.pulados });
    } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }

  if (res) {
    return (
      <div className="modal-bg" onClick={onSalvo}>
        <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">🎨 Cadastro por cores</span></span><button className="modal-x" onClick={onSalvo}>✕</button></div></div>
          <div className="pad">
            <p><strong>{res.criados.length}</strong> insumo(s) criado(s).{res.pulados ? ` ${res.pulados} já existiam (não dupliquei).` : ""}</p>
            {res.criados.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{res.criados.map((v) => <span key={v.cor} className="cor-chip on">{v.nome} · {v.cor}</span>)}</div>}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}><button className="btn btn-primary" onClick={onSalvo}>Concluir</button></div>
          </div>
        </div>
      </div>
    );
  }

  const preview = sel.slice(0, 8).map((c) => `${base.trim()} · ${c}`);
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">🎨 Cadastro rápido por cores</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <p className="muted" style={{ marginTop: 0 }}>Cadastre um material em <strong>várias cores de uma vez</strong>. O nome fica igual (ex.: <strong>Zíper</strong>) e cada cor vira um registro no <strong>campo cor</strong>. Cores próprias de materiais (não são as de produto).</p>
          <div className="form-grid2">
            <Campo label="Nome-base *"><input value={base} onChange={(e) => setBase(e.target.value)} placeholder="Zíper" /></Campo>
            <Campo label="Categoria"><input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Aviamento" /></Campo>
            <Campo label="Unidade"><input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un" /></Campo>
            <Campo label="Estoque mínimo (cada)"><input type="number" min={0} step="any" value={estMin} onChange={(e) => setEstMin(Number(e.target.value))} /></Campo>
            <Campo label="Código base (opcional)"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ZIP50" /></Campo>
          </div>
          <div style={{ marginTop: 6 }}>
            <div className="campo-l" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>CORES — {sel.length} selecionada(s)</span>
              {sel.length > 0 && <button className="btn btn-soft" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setSel([])}>limpar</button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {coresCat.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>Nenhuma cor no cadastro — digite abaixo.</span>
                : coresCat.map((c) => <button key={c} type="button" onClick={() => toggle(c)} className={"cor-chip" + (sel.includes(c) ? " on" : "")}>{c}</button>)}
            </div>
            <div className="row-gap" style={{ gap: 6 }}>
              <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNova(); } }} placeholder="+ nova cor (não cadastrada)" style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={addNova}>Adicionar</button>
            </div>
          </div>
          {sel.length > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Vai criar: {preview.map((n) => <span key={n} className="cor-chip on" style={{ marginRight: 4 }}>{n}</span>)}{sel.length > preview.length ? ` +${sel.length - preview.length}` : ""}</p>
          )}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando || !sel.length} onClick={salvar}>{salvando ? "Criando…" : `Criar ${sel.length || ""} insumo(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Aba HISTÓRICO ═══════════════════════════
function AbaHistorico() {
  const [log, setLog] = useState<ProdutoLog[]>([]);
  const [tipo, setTipo] = useState("");
  useEffect(() => { api.listarLogProdutos(tipo).then(setLog).catch(() => {}); }, [tipo]);
  const tipos = [
    { v: "", l: "Tudo" },
    { v: "produto", l: "Produtos" },
    { v: "estoque", l: "Estoque" },
    { v: "ficha", l: "Ficha técnica" },
    { v: "insumo", l: "Materiais" },
    { v: "baixa", l: "Baixa de materiais" },
  ];
  return (
    <>
      <div className="segmented" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {tipos.map((t) => <button key={t.v} className={"seg" + (tipo === t.v ? " seg-on" : "")} onClick={() => setTipo(t.v)}>{t.l}</button>)}
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Data</th><th>Ação</th><th>Descrição</th><th>Usuário</th></tr></thead>
          <tbody>
            {log.length === 0 ? (
              <tr><td colSpan={4} className="empty pad">Sem registros.</td></tr>
            ) : log.map((l) => (
              <tr key={l.id}>
                <td>{dt(l.criado_em)}</td>
                <td><span className="chip">{l.tipo}</span></td>
                <td>{l.descricao}</td>
                <td>{l.usuario || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Campo de formulário (rótulo + conteúdo), no padrão do sistema.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="campo">
      <span className="campo-label">{label}</span>
      {children}
    </label>
  );
}
