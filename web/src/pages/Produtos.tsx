import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  type Produto,
  type FichaItem,
  type KitComponente,
  type ProdutoMov,
  type Insumo,
  type InsumoMov,
  type ProdutoLog,
  type ItemPedidoEstoque,
  type BaixaPreview,
  type Pedido,
} from "../api";

type Aba = "produtos" | "estoque" | "entradas" | "ficha" | "insumos" | "historico";

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

const ABAS_VALIDAS: Aba[] = ["produtos", "estoque", "entradas", "ficha", "insumos", "historico"];

export function Produtos() {
  const [sp] = useSearchParams();
  const [aba, setAba] = useState<Aba>(() => {
    const q = sp.get("aba") as Aba | null;
    if (q && ABAS_VALIDAS.includes(q)) return q;
    return (localStorage.getItem("produtos-aba") as Aba) || "produtos";
  });
  // atalhos do menu (?aba=insumos, ?aba=ficha…) trocam a aba mesmo já montado
  useEffect(() => {
    const q = sp.get("aba") as Aba | null;
    if (q && ABAS_VALIDAS.includes(q)) setAba(q);
  }, [sp]);
  function mudar(a: Aba) {
    setAba(a);
    localStorage.setItem("produtos-aba", a);
  }
  const abas: { id: Aba; label: string }[] = [
    { id: "produtos", label: "📦 Produtos" },
    { id: "estoque", label: "📊 Estoque" },
    { id: "entradas", label: "⬇️ Entradas" },
    { id: "ficha", label: "🧵 Ficha Técnica" },
    { id: "insumos", label: "🧷 Insumos" },
    { id: "historico", label: "🕑 Histórico" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <div className="breadcrumb">Cadastro &amp; Estoque › {abas.find((a) => a.id === aba)?.label.replace(/^\S+\s/, "")}</div>
        </div>
        <div className="segmented" style={{ flexWrap: "wrap" }}>
          {abas.map((a) => (
            <button key={a.id} type="button" className={"seg" + (aba === a.id ? " seg-on" : "")} onClick={() => mudar(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "produtos" && <AbaProdutos />}
      {aba === "estoque" && <AbaEstoque />}
      {aba === "entradas" && <AbaEntradas />}
      {aba === "ficha" && <AbaFicha />}
      {aba === "insumos" && <AbaInsumos />}
      {aba === "historico" && <AbaHistorico />}
    </>
  );
}

// ═══════════════════════════ Aba PRODUTOS ═══════════════════════════
const VAZIO: Partial<Produto> = { nome: "", ref: "", categoria: "", tamanho: "", cor: "", tipo_fio: "", unidade: "un", tipo: "avulso", ativo: 1, observacao: "" };

function AbaProdutos() {
  const [itens, setItens] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(false);
  const [edit, setEdit] = useState<Partial<Produto> | null>(null);

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
        <button className="btn btn-primary" onClick={() => setEdit({ ...VAZIO })} style={{ marginLeft: "auto" }}>
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
      {edit && <ProdutoModal produto={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
    </>
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
  const [mov, setMov] = useState<Produto | null>(null);
  const [extrato, setExtrato] = useState<Produto | null>(null);

  function recarregar() {
    api.listarProdutos({ ativo: "1", busca }).then(setItens).catch(() => {});
  }
  useEffect(recarregar, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(recarregar, 250); return () => clearTimeout(t); }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>Estoque atual de cada produto. Clique em <strong>Movimentar</strong> para entrada/saída avulsa, ou no produto para ver o extrato.</p>
      <div className="row-gap" style={{ marginBottom: 12 }}>
        <input className="busca-ped" placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Produto</th><th>Ref</th><th>Cor</th><th>Tamanho</th><th className="num">Estoque atual</th><th></th></tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={6} className="empty pad">Nenhum produto ativo.</td></tr>
            ) : (
              itens.map((p) => (
                <tr key={p.id}>
                  <td className="strong link" style={{ cursor: "pointer" }} onClick={() => setExtrato(p)}>{p.nome}</td>
                  <td>{p.ref || "—"}</td>
                  <td>{p.cor || "—"}</td>
                  <td>{p.tamanho || "—"}</td>
                  <td className="num strong">{nf(Number(p.estoque) || 0)} {p.unidade || ""}</td>
                  <td><button className="btn btn-soft" onClick={() => setMov(p)}>Movimentar</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {mov && <MovModal alvo="produto" id={mov.id} nome={mov.nome} unidade={mov.unidade || "un"} onFechar={() => setMov(null)} onFeito={() => { setMov(null); recarregar(); }} />}
      {extrato && <ExtratoModal alvo="produto" id={extrato.id} nome={extrato.nome} onFechar={() => setExtrato(null)} />}
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
                    m.insumos_baixados ? <span className="muted" style={{ fontSize: 12 }}>insumos baixados ✓</span>
                      : <button className="btn btn-soft" onClick={() => setBaixa(m)}>Baixar insumos</button>
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

  useEffect(() => { api.listarPedidos().then(setPedidos).catch(() => {}); }, []);
  useEffect(() => {
    if (!pedidoId) { setItens([]); return; }
    api.itensPedidoParaEstoque(pedidoId).then((r) => {
      setNumero(r.pedido.numero);
      setItens(r.itens);
      const s: Record<number, boolean> = {};
      r.itens.forEach((it, i) => (s[i] = !!it.produto_id));
      setSel(s);
    }).catch((e) => setErro((e as Error).message));
  }, [pedidoId]);

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
              <p className="muted" style={{ fontSize: 13 }}>Itens casados por referência. Os sem produto vinculado precisam ser cadastrados antes (aba Produtos).</p>
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
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Baixar insumos desta entrada</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <p className="muted" style={{ marginTop: 0 }}>
            {mov.produto_nome} · entrada de <strong>{nf(mov.qtd)}</strong>. Confira o que será baixado do estoque de insumos:
          </p>
          <table className="table">
            <thead><tr><th>Insumo</th><th className="num">Por unid.</th><th className="num">Total</th><th className="num">Estoque</th></tr></thead>
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
            <button className="btn btn-primary" disabled={salvando || !temVinculo} onClick={confirmar} title={temVinculo ? "" : "Vincule os insumos da ficha ao cadastro de insumos para baixar"}>
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
      setMsg(`Ficha salva (${r.total} insumo(s)).`);
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
        Especifique os insumos usados por <strong>unidade</strong> do produto. Vincule ao cadastro de insumos para a baixa automática funcionar.
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
              <tr><th>Insumo (cadastro)</th><th>Nome</th><th>Tipo</th><th className="num">Qtd/unid.</th><th>Unidade</th><th>Obs.</th><th></th></tr>
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

  function recarregar() { api.listarInsumos({ busca }).then(setItens).catch(() => {}); }
  useEffect(recarregar, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(recarregar, 250); return () => clearTimeout(t); }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(i: Insumo) {
    if (!confirm(`Excluir o insumo "${i.nome}"?`)) return;
    await api.excluirInsumo(i.id).catch((e) => alert((e as Error).message));
    recarregar();
  }

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 12, alignItems: "center" }}>
        <input className="busca-ped" placeholder="🔎 Nome, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setEdit({ ...INSUMO_VAZIO })} style={{ marginLeft: "auto" }}>＋ Novo insumo</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Nome</th><th>Categoria</th><th>Código</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={7} className="empty pad">Nenhum insumo cadastrado.</td></tr>
            ) : itens.map((i) => {
              const baixo = (Number(i.estoque) || 0) <= (Number(i.estoque_min) || 0) && (Number(i.estoque_min) || 0) > 0;
              return (
                <tr key={i.id} style={{ opacity: i.ativo ? 1 : 0.5 }}>
                  <td className="strong link" style={{ cursor: "pointer" }} onClick={() => setExtrato(i)}>{i.nome}</td>
                  <td>{i.categoria || "—"}</td>
                  <td>{i.codigo || "—"}</td>
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
      {edit && <InsumoModal insumo={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
      {mov && <MovModal alvo="insumo" id={mov.id} nome={mov.nome} unidade={mov.unidade || "un"} onFechar={() => setMov(null)} onFeito={() => { setMov(null); recarregar(); }} />}
      {extrato && <ExtratoModal alvo="insumo" id={extrato.id} nome={extrato.nome} onFechar={() => setExtrato(null)} />}
    </>
  );
}

function InsumoModal({ insumo, onFechar, onSalvo }: { insumo: Partial<Insumo>; onFechar: () => void; onSalvo: () => void }) {
  const [i, setI] = useState<Partial<Insumo>>(insumo);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (patch: Partial<Insumo>) => setI((o) => ({ ...o, ...patch }));
  async function salvar() {
    if (!i.nome?.trim()) return setErro("Informe o nome do insumo.");
    setSalvando(true);
    setErro("");
    try { await api.salvarInsumo(i); onSalvo(); } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica"><div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">{i.id ? "Editar insumo" : "Novo insumo"}</span></span><button className="modal-x" onClick={onFechar}>✕</button></div></div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <div className="form-grid2">
            <Campo label="Nome do insumo *"><input value={i.nome || ""} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Zíper 50cm" /></Campo>
            <Campo label="Categoria"><input value={i.categoria || ""} onChange={(e) => set({ categoria: e.target.value })} placeholder="Aviamento, Embalagem…" /></Campo>
            <Campo label="Código interno"><input value={i.codigo || ""} onChange={(e) => set({ codigo: e.target.value })} /></Campo>
            <Campo label="Unidade de medida"><input value={i.unidade || ""} onChange={(e) => set({ unidade: e.target.value })} placeholder="un, m, g, kg" /></Campo>
            <Campo label="Estoque mínimo"><input type="number" min={0} step="any" value={i.estoque_min ?? 0} onChange={(e) => set({ estoque_min: Number(e.target.value) })} /></Campo>
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
    { v: "insumo", l: "Insumos" },
    { v: "baixa", l: "Baixa de insumos" },
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
