import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Modelo, type Cor, type TipoFio, type Tamanho, type Fornecedor, type Material, type MaterialCategoriaDef, type CompraSugestao, type Colecao, type ColecaoProduto, type BulkResult } from "../api";
import { getUser, PAGINAS, type Usuario } from "../auth";

type AbaCad = "produtos" | "tipos-fio" | "tamanhos" | "materiais" | "fornecedores" | "operadores" | "usuarios";
const ABAS_CAD: AbaCad[] = ["produtos", "tipos-fio", "tamanhos", "materiais", "fornecedores", "operadores", "usuarios"];
const ABA_LABEL: Record<AbaCad, string> = {
  produtos: "Produtos",
  "tipos-fio": "Fios",
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

// Modal reutilizável: COLAR EM MASSA. Cada linha vira um registro; colunas por
// Tab/;/, (igual planilha). Mostra o formato esperado, um preview antes de salvar
// e, DEPOIS de salvar, um botão DESFAZER que apaga exatamente o que foi criado.
function ColarEmMassa({ titulo, colunas, exemplo, onColar, onUndo, onFechar, onSalvo }: {
  titulo: string;
  colunas: string;   // ex.: "nome · tamanho · unidade · preço · estoque mín."
  exemplo: string;   // ex.: "Zíper preto;40;un;1,50;10"
  onColar: (texto: string) => Promise<BulkResult>;
  onUndo: (ids: string[]) => Promise<void>; // apaga os registros criados
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [res, setRes] = useState<BulkResult | null>(null); // resultado após salvar
  const [desfazendo, setDesfazendo] = useState(false);
  const [desfeito, setDesfeito] = useState(false);
  const linhas = texto.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean).length;

  async function salvar() {
    if (!linhas) return alert("Cole ao menos uma linha.");
    setSalvando(true);
    try {
      const r = await onColar(texto);
      setRes(r);        // fica no modal mostrando o resultado + Desfazer
      onSalvo();
    } catch (e) { alert((e as Error).message); }
    finally { setSalvando(false); }
  }
  async function desfazer() {
    if (!res?.ids.length) return;
    if (!confirm(`Desfazer? Isso apaga os ${res.ids.length} registro(s) que esta colagem criou.`)) return;
    setDesfazendo(true);
    try {
      await onUndo(res.ids);
      setDesfeito(true);
      onSalvo();        // atualiza a lista atrás do modal
    } catch (e) { alert((e as Error).message); }
    finally { setDesfazendo(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>📋 {titulo}</h2>

        {res ? (
          // ── Resultado + DESFAZER ──
          <>
            {desfeito ? (
              <div className="card pad" style={{ background: "var(--bg-soft, #f8fafc)", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>↩️ Colagem desfeita</div>
                <div className="muted" style={{ marginTop: 4 }}>Os {res.ids.length} registro(s) criado(s) foram apagados.</div>
              </div>
            ) : (
              <>
                <div className="card pad" style={{ background: "var(--bg-soft, #f8fafc)", fontSize: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>✓ {res.criados} cadastrado(s)</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {res.ignorados > 0 && <>{res.ignorados} ignorado(s) (repetido ou já existia). </>}
                    {res.sem_senha ? <>{res.sem_senha} sem senha. </> : null}
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Ficou errado? <strong>Desfazer</strong> apaga só o que esta colagem criou — o que já existia não é tocado.
                </p>
              </>
            )}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              {!desfeito && res.criados > 0 && (
                <button className="btn" onClick={desfazer} disabled={desfazendo}
                  style={{ color: "#b91c1c", borderColor: "#fca5a5" }}>{desfazendo ? "Desfazendo…" : "↩️ Desfazer"}</button>
              )}
              <button className="btn btn-primary" onClick={onFechar}>Concluir</button>
            </div>
          </>
        ) : (
          // ── Entrada de texto ──
          <>
            <p className="muted" style={{ marginTop: -4 }}>
              Uma linha = um registro. Colunas separadas por <strong>Tab</strong>, <strong>;</strong> ou <strong>,</strong> — dá pra colar direto de uma planilha.
            </p>
            <div className="card pad" style={{ background: "var(--bg-soft, #f8fafc)", fontSize: 13, marginBottom: 10 }}>
              <div><strong>Ordem das colunas:</strong> {colunas}</div>
              <div className="muted" style={{ marginTop: 4, fontFamily: "ui-monospace, monospace" }}>ex.: {exemplo}</div>
            </div>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} placeholder={exemplo} autoFocus
              style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 13, padding: 10, boxSizing: "border-box" }} />
            <div className="row-gap" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 13 }}>{linhas} linha(s)</span>
              <div className="row-gap">
                <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
                <button className="btn btn-primary" onClick={salvar} disabled={salvando || !linhas}>{salvando ? "Salvando…" : "Cadastrar todos"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cadastros</h1>
          <div className="breadcrumb">Configuração › {ABA_LABEL[aba]}</div>
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
  const [colecoes, setColecoes] = useState<Colecao[]>([]);
  const [produtos, setProdutos] = useState<Modelo[]>([]);
  const [tipos, setTipos] = useState<TipoFio[]>([]);
  const [aberta, setAberta] = useState<string | null>(null); // id da coleção aberta ("__todos__" = todos)
  const [prods, setProds] = useState<Record<string, ColecaoProduto[]>>({});
  const [modal, setModal] = useState<{ nome: string | null } | null>(null); // editar/novo produto
  const [gerenciar, setGerenciar] = useState<Colecao | null>(null); // modal "produtos da coleção"
  const [busca, setBusca] = useState("");
  const [ativos, setAtivos] = useState(0); // produtos distintos que estão em ≥1 coleção

  function recarregar() {
    api.listarColecoes().then((cs) => {
      setColecoes(cs);
      // pré-carrega os produtos de cada coleção: conta "ativos" (distintos) e deixa a abertura instantânea
      Promise.all(cs.map((c) => api.produtosDaColecao(c.id).then((ps): [string, ColecaoProduto[]] => [c.id, ps]).catch((): [string, ColecaoProduto[]] => [c.id, []])))
        .then((pares) => {
          const mapa: Record<string, ColecaoProduto[]> = {};
          const set = new Set<string>();
          pares.forEach(([id, ps]) => { mapa[id] = ps; ps.forEach((p) => set.add(p.modelo_nome)); });
          setProds(mapa);
          setAtivos(set.size);
        }).catch(() => {});
    }).catch(() => {});
    api.listarModelos().then(setProdutos).catch(() => {});
  }
  useEffect(() => { recarregar(); api.listarTiposFio().then(setTipos).catch(() => {}); }, []);

  function carregarProds(id: string) {
    api.produtosDaColecao(id).then((ps) => setProds((p) => ({ ...p, [id]: ps }))).catch(() => {});
  }
  function abrir(id: string) {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id);
    if (id !== "__todos__" && !prods[id]) carregarProds(id);
  }
  async function novaColecao() {
    const nome = prompt("Nome da nova coleção:");
    if (!nome || !nome.trim()) return;
    try { await api.salvarColecao({ nome: nome.trim(), ordem: colecoes.length + 1 }); recarregar(); } catch (e) { alert((e as Error).message); }
  }
  async function renomearColecao(col: Colecao) {
    const nome = prompt("Novo nome da coleção:", col.nome);
    if (!nome || !nome.trim()) return;
    try { await api.salvarColecao({ id: col.id, nome: nome.trim(), ordem: col.ordem }); recarregar(); } catch (e) { alert((e as Error).message); }
  }
  async function excluirColecao(col: Colecao) {
    if (!confirm(`Excluir a coleção "${col.nome}"? Os produtos NÃO são apagados, só saem da coleção.`)) return;
    try { await api.excluirColecao(col.id); recarregar(); } catch (e) { alert((e as Error).message); }
  }
  async function excluirProduto(m: { nome: string }) {
    if (!confirm(`Excluir o produto "${m.nome}"? (sai de todas as coleções)`)) return;
    try { await api.excluirModelo(m.nome); recarregar(); if (aberta && aberta !== "__todos__") carregarProds(aberta); } catch (e) { alert((e as Error).message); }
  }

  const filtro = busca.trim().toLowerCase();
  const prodFiltrados = produtos.filter((m) => `${m.nome} ${m.ref || ""}`.toLowerCase().includes(filtro));

  // Indicadores do topo
  const total = produtos.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const pronta = colecoes.find((c) => c.nome.toLowerCase() === "pronta entrega")?.produtos ?? 0;
  const KPIS = [
    { ic: "📦", cor: "#7c3aed", bg: "#ede9fe", lbl: "Total de produtos", num: total, sub: "100% do catálogo" },
    { ic: "🟢", cor: "#16a34a", bg: "#dcfce7", lbl: "Pronta entrega", num: pronta, sub: `${pct(pronta)}% do total` },
    { ic: "🗂️", cor: "#2563eb", bg: "#dbeafe", lbl: "Coleções", num: colecoes.length, sub: "Ativas" },
    { ic: "✅", cor: "#ea580c", bg: "#ffedd5", lbl: "Produtos ativos", num: ativos, sub: `${pct(ativos)}% do total` },
  ];

  return (
    <>
      <div className="prod-kpis">
        {KPIS.map((k) => (
          <div className="kpi" key={k.lbl}>
            <span className="kpi-ic" style={{ background: k.bg, color: k.cor }}>{k.ic}</span>
            <div>
              <div className="kpi-lbl">{k.lbl}</div>
              <div className="kpi-num">{k.num}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Nova coleção de um lado, buscar preenchendo */}
      <div className="row-gap" style={{ marginBottom: 10, alignItems: "center", gap: 8 }}>
        <button className="btn btn-soft" onClick={novaColecao}>＋ Nova coleção</button>
        <input className="busca-ped" placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: 1 }} />
      </div>
      {/* Coleções + Novo produto: botões do mesmo tamanho (flex igual) */}
      <div className="row-gap" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        {colecoes.map((col) => (
          <button type="button" key={col.id} className={"btn " + (aberta === col.id ? "btn-primary" : "btn-soft")} style={{ flex: 1, minWidth: 120 }} onClick={() => abrir(col.id)}>
            {col.nome} ({col.produtos ?? 0})
          </button>
        ))}
        <button type="button" className={"btn " + (aberta === "__todos__" ? "btn-primary" : "btn-soft")} style={{ flex: 1, minWidth: 120 }} onClick={() => abrir("__todos__")}>
          Todos os produtos ({produtos.length})
        </button>
        <button className="btn btn-primary" style={{ flex: 1, minWidth: 120 }} onClick={() => setModal({ nome: null })}>＋ Novo produto</button>
      </div>

      {/* Produtos da coleção escolhida */}
      {aberta && aberta !== "__todos__" && (() => {
        const col = colecoes.find((c) => c.id === aberta);
        if (!col) return null;
        const lista = prods[col.id] || [];
        return (
          <div className="card">
            <div className="row-gap" style={{ alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}>
              <span className="chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{col.nome}</span>
              <span className="muted" style={{ fontSize: 12 }}>{col.produtos ?? 0} produto(s)</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                <button className="btn btn-soft" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => { if (!prods[col.id]) carregarProds(col.id); setGerenciar(col); }}>Gerenciar produtos</button>
                <button className="icon-btn" title="Renomear coleção" onClick={() => renomearColecao(col)}>✎</button>
                <button className="icon-btn" title="Excluir coleção" onClick={() => excluirColecao(col)}>🗑</button>
              </span>
            </div>
            <table className="table">
              <thead><tr><th>Produto</th><th>Código</th><th>Tipo de fio</th><th></th></tr></thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={4} className="empty pad">Nenhum produto nesta coleção. Use "Gerenciar produtos".</td></tr>
                ) : lista.map((p) => (
                  <tr key={p.modelo_nome} style={{ cursor: "pointer" }} onClick={() => setModal({ nome: p.modelo_nome })}>
                    <td className="strong">{p.modelo_nome}</td>
                    <td>{p.ref || "—"}</td>
                    <td>{p.fio_nome ? <span className="chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{p.fio_nome}</span> : "—"}</td>
                    <td><button className="icon-btn" title="Editar" onClick={(e) => { e.stopPropagation(); setModal({ nome: p.modelo_nome }); }}>✎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Todos os produtos (editar qualquer um, mesmo fora de coleção) */}
      {aberta === "__todos__" && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Produto</th><th>Código</th><th>Galga / Parte</th><th>Composição</th><th></th></tr></thead>
            <tbody>
              {prodFiltrados.length === 0 ? (
                <tr><td colSpan={5} className="empty pad">Nenhum produto{filtro ? " com esse filtro" : ""}.</td></tr>
              ) : prodFiltrados.map((m) => (
                <tr key={m.nome} style={{ cursor: "pointer" }} onClick={() => setModal({ nome: m.nome })}>
                  <td className="strong">{m.nome}</td>
                  <td>{m.ref || "—"}</td>
                  <td><span className="chip">{m.parte === 1 ? "Galga 3 · Parte 1" : "Galga 7 · Parte 2"}</span></td>
                  <td>{m.composicao || "—"}</td>
                  <td><button className="icon-btn" title="Excluir" onClick={(e) => { e.stopPropagation(); excluirProduto(m); }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ProdutoFormModal
          nomeEdit={modal.nome}
          onFechar={() => setModal(null)}
          onSalvo={() => { recarregar(); if (aberta && aberta !== "__todos__") carregarProds(aberta); }}
        />
      )}
      {gerenciar && (
        <GerenciarProdutosModal
          colecao={gerenciar}
          produtos={produtos}
          tipos={tipos}
          atuais={prods[gerenciar.id] || []}
          onFechar={() => setGerenciar(null)}
          onSalvo={() => { const id = gerenciar.id; setGerenciar(null); recarregar(); carregarProds(id); }}
        />
      )}
    </>
  );
}

// Modal "Produtos da coleção": marca quais produtos entram e, por produto, o tipo de fio.
function GerenciarProdutosModal({ colecao, produtos, tipos, atuais, onFechar, onSalvo }: { colecao: Colecao; produtos: Modelo[]; tipos: TipoFio[]; atuais: ColecaoProduto[]; onFechar: () => void; onSalvo: () => void }) {
  const [sel, setSel] = useState<Record<string, string>>(() => { const m: Record<string, string> = {}; atuais.forEach((p) => { m[p.modelo_nome] = p.fio_id || ""; }); return m; });
  const [busca, setBusca] = useState("");
  function toggle(nome: string) { setSel((s) => { const n = { ...s }; if (nome in n) delete n[nome]; else n[nome] = ""; return n; }); }
  async function salvar() {
    const arr = Object.entries(sel).map(([modelo_nome, fio_id]) => ({ modelo_nome, fio_id: fio_id || null }));
    try { await api.salvarProdutosColecao(colecao.id, arr); onSalvo(); } catch (e) { alert((e as Error).message); }
  }
  const filtro = busca.trim().toLowerCase();
  const lista = produtos.filter((m) => `${m.nome} ${m.ref || ""}`.toLowerCase().includes(filtro));
  const n = Object.keys(sel).length;
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Produtos da coleção · {colecao.nome}</h2>
        <p className="muted" style={{ marginTop: -6 }}>Marque os produtos e, se quiser, o tipo de fio de cada um nesta coleção.</p>
        <input className="busca-ped" style={{ width: "100%", marginBottom: 10 }} placeholder="🔎 Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div style={{ maxHeight: "48vh", overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
          {lista.map((m) => {
            const on = m.nome in sel;
            return (
              <div key={m.nome} className="row-gap" style={{ alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid #f3f4f8", cursor: "pointer", background: on ? "#eef2ff55" : undefined }} onClick={() => toggle(m.nome)}>
                <input type="checkbox" checked={on} readOnly />
                <span className="strong">{m.nome}</span>
                <span className="muted" style={{ fontSize: 12 }}>{m.ref || ""}</span>
                {on && (
                  <select value={sel[m.nome]} onClick={(e) => e.stopPropagation()} onChange={(e) => setSel((s) => ({ ...s, [m.nome]: e.target.value }))} style={{ marginLeft: "auto", minWidth: 150 }}>
                    <option value="">— fio (opcional) —</option>
                    {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          {lista.length === 0 && <p className="muted pad" style={{ margin: 0 }}>Nenhum produto.</p>}
        </div>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14, alignItems: "center" }}>
          <span className="muted" style={{ marginRight: "auto", fontSize: 13 }}>{n} produto(s) na coleção</span>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// Seletor "Aplicar em": botão compacto (resumo) que abre um menu suspenso com
// "Todos os tamanhos" + as caixinhas por tamanho. Posição fixa p/ não ser cortado.
function AplicarEm({ todos, aplicar, tamanhos, onTodos, onTam }: { todos: boolean; aplicar: Set<string>; tamanhos: string[]; onTodos: () => void; onTam: (t: string) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const abrir = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPos({ top: r.bottom + 4, left: r.left }); };
  const sel = [...aplicar].filter((t) => tamanhos.includes(t));
  const resumo = todos ? "Todos" : sel.length === 0 ? "Escolher…" : sel.length <= 2 ? sel.join(", ") : `${sel.length} tamanhos`;
  return (
    <>
      <button type="button" className="btn btn-soft" onClick={abrir} title={todos ? "Todos os tamanhos" : sel.join(", ")}
        style={{ maxWidth: 150, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "6px 10px" }}>
        {resumo} ▾
      </button>
      {pos && (<>
        <div onClick={() => setPos(null)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
        <div className="card" style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 61, minWidth: 170, maxHeight: 260, overflowY: "auto", padding: 6, boxShadow: "0 8px 24px #0004" }}>
          <label className="row-gap" style={{ gap: 7, padding: "5px 7px", cursor: "pointer", fontWeight: 700 }}>
            <input type="checkbox" checked={todos} onChange={onTodos} /> <span>Todos os tamanhos</span>
          </label>
          <div style={{ borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />
          {tamanhos.length === 0
            ? <div className="muted" style={{ padding: "5px 7px", fontSize: 12 }}>Selecione tamanhos do produto na aba Cores &amp; Tamanhos.</div>
            : tamanhos.map((t) => (
                <label key={t} className="row-gap" style={{ gap: 7, padding: "5px 7px", cursor: "pointer" }}>
                  <input type="checkbox" checked={!todos && aplicar.has(t)} onChange={() => onTam(t)} /> <span>{t}</span>
                </label>
              ))}
        </div>
      </>)}
    </>
  );
}

// Uma linha da ficha de consumo do produto (aba Materiais).
type FichaLinha = {
  id: string; tipo: string; fonte: "material" | "fio";
  nomeMat: string; material_id: string;
  quantidade: string; unidade: string;
  aplicarTodos: boolean; aplicar: Set<string>;
  obs: string; status: "ativo" | "inativo";
  corProduto?: string; // cor do tricô (produto) ligada — usado no zíper
};
// Valor de uma "coluna" (chave) de um material — campo direto ou extra:<k>.
function valorCol(m: Material, key: string): string {
  if (!key) return "";
  if (key.startsWith("extra:")) {
    try { const o = m.extra ? JSON.parse(m.extra) : {}; return String((o as Record<string, unknown>)[key.slice(6)] ?? ""); } catch { return ""; }
  }
  return String((m as unknown as Record<string, unknown>)[key] ?? "");
}
// A "variação" do material na ficha (comprimento/tamanho/medida… conforme o tipo).
function variacaoMat(m: Material): string {
  const key = CAMPOS_POR_TIPO[m.categoria]?.variacao || "tamanho";
  return valorCol(m, key) || m.tamanho || m.cor || "único";
}

function ProdutoFormModal({ nomeEdit, onFechar, onSalvo }: { nomeEdit: string | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [ref, setRef] = useState("");
  const [parte, setParte] = useState(2);
  const [composicao, setComposicao] = useState("");
  const [cores, setCores] = useState<Cor[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [fioSel, setFioSel] = useState<string | null>(null); // tipo de fio escolhido no seletor
  const [tamCat, setTamCat] = useState<Tamanho[]>([]);
  const [selTam, setSelTam] = useState<Record<string, boolean>>({});
  const [pesos, setPesos] = useState<Record<string, string>>({});
  const [tempos, setTempos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false); // "✓ salvo" — continua na tela após salvar
  const [refNome, setRefNome] = useState(nomeEdit); // nome já gravado (título + renomear)
  const [matCat, setMatCat] = useState<Material[]>([]);       // catálogo de materiais
  const [matDefs, setMatDefs] = useState<MaterialCategoriaDef[]>([]); // categorias (rótulos)
  const [fios, setFios] = useState<TipoFio[]>([]);            // tipos de fio (fonte 'fio')
  const [linhas, setLinhas] = useState<FichaLinha[]>([]);     // ficha de consumo (uma linha por material)
  const [secao, setSecao] = useState<string>("tamanhos");     // sub-menu ativo (uma seção por item do produto)
  // Zíper: mesmo comprimento para todos os tamanhos; a cor (número do fabricante) é
  // ligada manualmente a cada cor do tricô do produto (corMap: cor do produto → zíper id).
  const [ziperSel, setZiperSel] = useState<{ nome: string; comprimento: string; qtd: string; corMap: Record<string, string> }>({ nome: "", comprimento: "", qtd: "1", corMap: {} });
  const fioSeeded = useRef(false); // ao editar, restaura o "Tipo de fio" a partir das cores salvas (só 1x)

  useEffect(() => {
    Promise.all([api.listarCores(), api.listarTamanhos(), api.listarMateriais(), api.listarCategoriasMaterial(), api.listarTiposFio()])
      .then(([cs, ts, ms, mc, fs]) => { setCores(cs); setTamCat(ts); setMatCat(ms); setMatDefs(mc); setFios(fs); })
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
        // Ficha: agrupa as linhas por (material + qtd + un + obs + status + fonte);
        // cada grupo aplica-se a um conjunto de tamanhos.
        const grp = new Map<string, FichaLinha>();
        (m.materiais || []).forEach((mt) => {
          const key = [mt.material_id, mt.quantidade, mt.unidade, mt.obs, mt.status, mt.fonte].join("|");
          let ln = grp.get(key);
          if (!ln) {
            ln = { id: crypto.randomUUID(), tipo: mt.categoria || "", fonte: mt.fonte === "fio" ? "fio" : "material",
              nomeMat: mt.nome || "", material_id: mt.material_id,
              quantidade: mt.quantidade != null ? String(mt.quantidade) : "", unidade: mt.unidade || "",
              aplicarTodos: false, aplicar: new Set<string>(), obs: mt.obs || "", status: mt.status === "inativo" ? "inativo" : "ativo" };
            grp.set(key, ln);
          }
          ln.aplicar.add(mt.tamanho);
        });
        const tamsProd = m.tamanhos.map((t) => t.tamanho);
        const arr = [...grp.values()];
        arr.forEach((ln) => { if (ln.aplicar.size && tamsProd.length && tamsProd.every((t) => ln.aplicar.has(t))) ln.aplicarTodos = true; });
        setLinhas(arr);
        // Zíper: semeia a família (nome + comprimento) e o mapa cor do produto → zíper id.
        const zip = (m.materiais || []).filter((x) => x.categoria === "ziper");
        if (zip.length) {
          const corMap: Record<string, string> = {};
          for (const z of zip) { const cp = (z.cor_produto || z.cor || "").trim(); if (cp && z.material_id) corMap[cp] = z.material_id; }
          setZiperSel({ nome: zip[0].nome || "", comprimento: zip[0].variacao || "", qtd: zip[0].quantidade != null ? String(zip[0].quantidade) : "1", corMap });
        }
      }).catch((e) => setErro((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeEdit]);

  // Zíper: regera as linhas da ficha (uma por cor do produto) sempre que mudar a
  // família escolhida (nome + comprimento), a quantidade, as cores do produto ou o
  // catálogo de materiais. O comprimento é o mesmo em todos os tamanhos (aplicarTodos);
  // a cor de cada linha vem do zíper cujo "Cor do tricô" casa com a cor do produto.
  useEffect(() => {
    setLinhas((prev) => {
      const outros = prev.filter((l) => l.tipo !== "ziper");
      if (!ziperSel.nome || !ziperSel.comprimento) return outros.length === prev.length ? prev : outros;
      const variantes = matCat.filter((m) => m.categoria === "ziper" && m.nome === ziperSel.nome && (valorCol(m, "extra:comprimento") || "") === ziperSel.comprimento);
      const novas: FichaLinha[] = [];
      for (const cor of sel) {
        // 1º o vínculo manual (corMap); senão, tenta casar pelo nome da cor do tricô.
        const mapped = ziperSel.corMap[cor];
        const v = (mapped && variantes.find((x) => x.id === mapped)) || variantes.find((x) => (x.cor || "").trim().toLowerCase() === cor.trim().toLowerCase());
        if (!v) continue; // cor do produto ainda sem zíper ligado — avisado na tela
        novas.push({ id: "ziper:" + cor + ":" + v.id, tipo: "ziper", fonte: "material", nomeMat: ziperSel.nome, material_id: v.id, quantidade: ziperSel.qtd, unidade: v.unidade || "un", aplicarTodos: true, aplicar: new Set<string>(), obs: "", status: "ativo", corProduto: cor });
      }
      return [...outros, ...novas];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ziperSel, matCat, sel]);

  // Tipo de fio não é um campo salvo — ele vem das cores do produto. Ao editar,
  // assim que as cores e o catálogo estiverem prontos, restaura o fio escolhido
  // (fioSel) a partir das cores salvas, uma única vez, para a tela abrir no fio certo.
  useEffect(() => {
    if (fioSeeded.current || !nomeEdit) return;
    if (sel.size > 0 && cores.length > 0) {
      const f = cores.find((c) => sel.has(c.nome))?.fio_nome ?? "";
      setFioSel(f);
      fioSeeded.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cores, sel, nomeEdit]);

  const toggleCor = (n: string) => { setSalvo(false); setSel((prev) => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; }); };
  function toggleGrupo(gcores: Cor[]) {
    setSalvo(false);
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
  // Lista de tipos de fio (a partir de TODAS as cores, sem o filtro, pra os
  // botões não sumirem ao filtrar). O produto usa UM tipo de fio só.
  const fiosLista: { fio: string; fornecedor: string | null; total: number }[] = [];
  const idxF = new Map<string, number>();
  for (const c of cores) {
    const key = c.fio_nome || "";
    if (!idxF.has(key)) { idxF.set(key, fiosLista.length); fiosLista.push({ fio: key, fornecedor: c.fornecedor_nome || null, total: 0 }); }
    fiosLista[idxF.get(key)!].total++;
  }
  const selDoFio = (fio: string) => cores.filter((c) => (c.fio_nome || "") === fio && sel.has(c.nome)).length;
  const nForaFio = fioSel != null ? sel.size - selDoFio(fioSel) : 0; // cores marcadas em outros fios
  function manterSoDoFio() {
    setSel((prev) => new Set([...prev].filter((n) => (cores.find((c) => c.nome === n)?.fio_nome || "") === fioSel)));
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
    // Ficha de consumo: cada linha vira uma linha por tamanho onde se aplica.
    const tamsSel = linhasTam.filter((t) => selTam[t.nome]).map((t) => t.nome);
    const materiais: { tamanho: string; material_id: string; quantidade: number | null; unidade: string | null; obs: string | null; status: string; fonte: string; cor_produto: string | null }[] = [];
    for (const ln of linhas) {
      if (!ln.material_id) continue;
      const q = ln.quantidade.trim() ? Number(ln.quantidade.replace(",", ".")) : null;
      const alvos = ln.aplicarTodos ? tamsSel : tamsSel.filter((t) => ln.aplicar.has(t));
      for (const tam of alvos) materiais.push({ tamanho: tam, material_id: ln.material_id, quantidade: q, unidade: ln.unidade || null, obs: ln.obs || null, status: ln.status, fonte: ln.fonte, cor_produto: ln.corProduto || null });
    }
    try {
      await api.salvarModelo(
        { nome: nome.trim(), parte, ref: ref.trim(), composicao: composicao.trim(), cores: [...sel], tamanhos, materiais },
        refNome || undefined
      );
      onSalvo();               // recarrega a lista
      onFechar();              // salvou → fecha e volta pra lista (1 clique só)
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  // ── Ficha de consumo (aba Materiais) ──
  const tamsProdSel = linhasTam.filter((t) => selTam[t.nome]).map((t) => t.nome);
  const tiposFicha = [{ slug: "fio", nome: "Fio" }, ...matDefs.map((d) => ({ slug: d.slug, nome: d.nome }))];
  const nomesDoTipo = (tipo: string): string[] =>
    tipo === "fio" ? [...new Set(fios.map((f) => f.nome))] : [...new Set(matCat.filter((m) => m.categoria === tipo).map((m) => m.nome))];
  const variacoesDoTipo = (tipo: string, nomeMat: string): { id: string; label: string; preco: number | null; unidade: string }[] =>
    tipo === "fio"
      ? (fios.filter((f) => f.nome === nomeMat).map((f) => ({ id: f.id, label: "Cor do produto", preco: f.preco ?? null, unidade: "kg" })))
      : matCat.filter((m) => m.categoria === tipo && m.nome === nomeMat).map((m) => ({ id: m.id, label: variacaoMat(m), preco: m.preco ?? null, unidade: m.unidade || "" }));
  const precoLinha = (ln: FichaLinha): number | null =>
    ln.fonte === "fio" ? (fios.find((f) => f.id === ln.material_id)?.preco ?? null) : (matCat.find((m) => m.id === ln.material_id)?.preco ?? null);
  const custoLinha = (ln: FichaLinha): number => (precoLinha(ln) || 0) * (Number(ln.quantidade.replace(",", ".")) || 0);
  const setLn = (id: string, patch: Partial<FichaLinha>) => { setSalvo(false); setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))); };
  const addLinha = () => { setSalvo(false); setLinhas((ls) => [...ls, { id: crypto.randomUUID(), tipo: "", fonte: "material", nomeMat: "", material_id: "", quantidade: "", unidade: "", aplicarTodos: true, aplicar: new Set(), obs: "", status: "ativo" }]); };
  const addLinhaTipo = (cat: string) => { setSalvo(false); setLinhas((ls) => [...ls, { id: crypto.randomUUID(), tipo: cat, fonte: cat === "fio" ? "fio" : "material", nomeMat: "", material_id: "", quantidade: "", unidade: "", aplicarTodos: true, aplicar: new Set(), obs: "", status: "ativo" }]); };
  const delLinha = (id: string) => { setSalvo(false); setLinhas((ls) => ls.filter((l) => l.id !== id)); };
  const custoPorTam = tamsProdSel.map((tam) => ({
    tam, custo: linhas.filter((ln) => ln.status === "ativo" && (ln.aplicarTodos || ln.aplicar.has(tam))).reduce((s, ln) => s + custoLinha(ln), 0),
  }));

  // Sub-menu do produto: uma seção por item que o produto usa (cada uma com suas regras).
  // As seções com `cat` reaproveitam o editor de ficha filtrado por aquela categoria de material.
  const SECOES: { id: string; nome: string; cat?: string }[] = [
    { id: "tamanhos", nome: "Tamanhos" },
    { id: "fio", nome: "Tipo de fio" },
    { id: "cores", nome: "Cores" },
    { id: "tempo", nome: "Tempo" },
    { id: "peso", nome: "Peso" },
    { id: "ziper", nome: "Zíper", cat: "ziper" },
    { id: "encarte", nome: "Encarte", cat: "encarte" },
    { id: "tag", nome: "Tag", cat: "tag" },
    { id: "embalagem", nome: "Embalagens", cat: "embalagem" },
    { id: "forro", nome: "Forro", cat: "forro" },
    { id: "tassel", nome: "Tassel", cat: "tassel" },
    { id: "etiqueta", nome: "Etiqueta", cat: "etiqueta" },
  ];
  const contaSecao = (s: { cat?: string }) => (s.cat ? linhas.filter((l) => l.tipo === s.cat).length : 0);
  // Uma seção conta como "definida" (✓) quando já tem o que precisa preenchido.
  const secaoDefinida = (s: { id: string; cat?: string }): boolean => {
    switch (s.id) {
      case "tamanhos": return tamsProdSel.length > 0;
      // Fio vem das cores: definido quando alguma cor do produto tem tipo de fio,
      // ou quando um fio foi escolhido na tela (mesmo antes de marcar cores).
      case "fio": return [...sel].some((n) => !!(cores.find((c) => c.nome === n)?.fio_nome)) || (fioSel !== null && fioSel !== "");
      case "cores": return sel.size > 0;
      case "tempo": return tamsProdSel.some((t) => (tempos[t] || "").trim() !== "");
      case "peso": return tamsProdSel.some((t) => (pesos[t] || "").trim() !== "");
      default: return s.cat ? linhas.some((l) => l.tipo === s.cat && l.material_id) : false;
    }
  };

  // Zíper: famílias disponíveis = agrupa o catálogo por (nome + comprimento);
  // cada família tem uma variante por "Cor do tricô".
  const ziperNomes = [...new Set(matCat.filter((m) => m.categoria === "ziper").map((m) => m.nome))];
  const ziperComprimentos = [...new Set(matCat.filter((m) => m.categoria === "ziper" && m.nome === ziperSel.nome).map((m) => valorCol(m, "extra:comprimento") || ""))];
  function renderZiper() {
    const variantes = matCat.filter((m) => m.categoria === "ziper" && m.nome === ziperSel.nome && (valorCol(m, "extra:comprimento") || "") === ziperSel.comprimento);
    const coresProduto = [...sel];
    const setFam = (patch: Partial<{ nome: string; comprimento: string; qtd: string }>) => { setSalvo(false); setZiperSel((z) => ({ ...z, ...patch })); };
    const setCorLink = (cor: string, matId: string) => { setSalvo(false); setZiperSel((z) => ({ ...z, corMap: { ...z.corMap, [cor]: matId } })); };
    // O nº da cor do zíper é o "Código do fabricante" (m.codigo). Rótulo p/ o seletor.
    const numLabel = (v: Material) => [v.codigo ? "Nº " + v.codigo : "", v.cor || ""].filter(Boolean).join(" · ") || "sem número";
    // Vínculo efetivo de uma cor: 1º o manual (corMap); senão casa pelo nome do tricô.
    const idDaCor = (cor: string) => ziperSel.corMap[cor] || variantes.find((x) => (x.cor || "").trim().toLowerCase() === cor.trim().toLowerCase())?.id || "";
    const faltando = ziperSel.nome && ziperSel.comprimento ? coresProduto.filter((cor) => !idDaCor(cor)).length : 0;
    return (
      <>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          O zíper usa o <strong>mesmo comprimento em todos os tamanhos</strong>. Ligue, para cada <strong>cor do tricô</strong> do produto, o <strong>nº da cor do zíper</strong> (código do fabricante) — os nomes não precisam ser iguais.
        </p>
        <div className="form-grid2">
          <Campo label="Zíper">
            <select value={ziperSel.nome} onChange={(e) => setFam({ nome: e.target.value, comprimento: "" })}>
              <option value="">{ziperNomes.length ? "— escolha o zíper —" : "nenhum zíper cadastrado"}</option>
              {ziperNomes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Campo>
          <Campo label="Comprimento (todos os tamanhos)">
            <select value={ziperSel.comprimento} disabled={!ziperSel.nome} onChange={(e) => setFam({ comprimento: e.target.value })}>
              <option value="">— escolha —</option>
              {ziperComprimentos.map((c) => <option key={c || "único"} value={c}>{c || "único"}</option>)}
            </select>
          </Campo>
          <Campo label="Quantidade por peça">
            <input inputMode="decimal" value={ziperSel.qtd} onChange={(e) => setFam({ qtd: e.target.value })} style={{ width: 90 }} />
          </Campo>
        </div>
        {coresProduto.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Escolha as cores do produto na seção <strong>Cores</strong> para ligar o zíper a cada cor.</p>
        ) : !(ziperSel.nome && ziperSel.comprimento) ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Escolha o zíper e o comprimento acima.</p>
        ) : (
          <div className="card" style={{ overflowX: "auto", marginTop: 10 }}>
            {variantes.length === 0
              ? <div className="pad" style={{ color: "#991b1b", fontSize: 12.5, fontWeight: 600 }}>⚠️ Nenhum zíper cadastrado com esse nome/comprimento. Cadastre em <strong>Materiais › Zíper</strong>.</div>
              : faltando > 0 && <div className="pad" style={{ color: "#991b1b", fontSize: 12.5, fontWeight: 600 }}>⚠️ {faltando} cor(es) do tricô ainda sem nº de zíper ligado.</div>}
            <table className="table">
              <thead><tr><th>Cor do tricô (produto)</th><th>Nº da cor do zíper</th><th>Situação</th></tr></thead>
              <tbody>
                {coresProduto.map((cor) => {
                  const id = idDaCor(cor);
                  const v = variantes.find((x) => x.id === id);
                  return (
                    <tr key={cor}>
                      <td className="strong">{cor}</td>
                      <td>
                        <select value={id} onChange={(e) => setCorLink(cor, e.target.value)} disabled={variantes.length === 0} style={{ minWidth: 190 }}>
                          <option value="">— ligar nº —</option>
                          {variantes.map((x) => <option key={x.id} value={x.id}>{numLabel(x)}</option>)}
                        </select>
                      </td>
                      <td>{v ? <span className="chip" style={{ background: "#dcfce7", color: "#166534" }}>✓ ligado</span> : <span className="chip" style={{ background: "#fee2e2", color: "#991b1b" }}>⚠ ligar nº</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  // Editor da ficha filtrado por uma categoria de material (Zíper, Forro, Tag, …).
  // Reaproveita as mesmas linhas/estado, escondendo a coluna "Tipo" (já é a própria seção).
  function renderMateriaisSecao(cat: string, nomeSecao: string) {
    const linhasCat = linhas.filter((ln) => ln.tipo === cat);
    const rotulo = nomeSecao.toLowerCase();
    return (
      <>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13 }}>{nomeSecao} usado(s) no produto, com quantidade e onde se aplica.</span>
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => addLinhaTipo(cat)}>＋ Adicionar {rotulo}</button>
        </div>
        {tamsProdSel.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Dica: selecione os tamanhos na seção <strong>Tamanhos</strong> para escolher onde cada item se aplica.</p>}
        {linhasCat.length === 0 ? (
          <div className="card pad empty">Nenhum item nesta seção. Clique em <strong>＋ Adicionar {rotulo}</strong>.</div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 820 }}>
              <thead><tr>
                <th>Material</th><th>Variação</th><th className="num">Qtd</th><th>Unid.</th><th>Aplicar em</th><th>Obs</th><th>Status</th><th className="num">Custo</th><th></th>
              </tr></thead>
              <tbody>
                {linhasCat.map((ln) => {
                  const nomes = nomesDoTipo(ln.tipo);
                  const vars = variacoesDoTipo(ln.tipo, ln.nomeMat);
                  return (
                    <tr key={ln.id} style={ln.status === "inativo" ? { opacity: 0.55 } : undefined}>
                      <td><select value={ln.nomeMat} onChange={(e) => { const nm = e.target.value; const vs = variacoesDoTipo(ln.tipo, nm); const only = vs.length === 1 ? vs[0] : null; setLn(ln.id, { nomeMat: nm, material_id: only ? only.id : "", unidade: only ? only.unidade : "" }); }} style={{ minWidth: 130 }}>
                        <option value="">—</option>
                        {nomes.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
                      </select></td>
                      <td>{ln.tipo === "fio" ? <span className="muted">Cor do produto</span> : (
                        <select value={ln.material_id} disabled={!ln.nomeMat} onChange={(e) => { const v = vars.find((x) => x.id === e.target.value); setLn(ln.id, { material_id: e.target.value, unidade: v?.unidade || ln.unidade }); }} style={{ minWidth: 110 }}>
                          <option value="">—</option>
                          {vars.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                      )}</td>
                      <td className="num"><input className="num" inputMode="decimal" value={ln.quantidade} onChange={(e) => setLn(ln.id, { quantidade: e.target.value })} style={{ width: 66 }} /></td>
                      <td><input value={ln.unidade} onChange={(e) => setLn(ln.id, { unidade: e.target.value })} style={{ width: 54 }} /></td>
                      <td><AplicarEm todos={ln.aplicarTodos} aplicar={ln.aplicar} tamanhos={tamsProdSel} onTodos={() => setLn(ln.id, { aplicarTodos: true })} onTam={(tam) => { const n = new Set(ln.aplicar); n.has(tam) ? n.delete(tam) : n.add(tam); setLn(ln.id, { aplicarTodos: false, aplicar: n }); }} /></td>
                      <td><input value={ln.obs} onChange={(e) => setLn(ln.id, { obs: e.target.value })} spellCheck lang="pt-BR" style={{ width: 110 }} /></td>
                      <td><select value={ln.status} onChange={(e) => setLn(ln.id, { status: e.target.value === "inativo" ? "inativo" : "ativo" })}>
                        <option value="ativo">Ativo</option><option value="inativo">Inativo</option>
                      </select></td>
                      <td className="num">{precoLinha(ln) != null ? rBR(custoLinha(ln)) : "—"}</td>
                      <td><button type="button" className="icon-btn" title="Remover" onClick={() => delLinha(ln.id)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 980, width: "min(980px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{refNome ? "Editar produto" : "Novo produto"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}

          {/* Dados do produto — sempre visíveis */}
          <div className="form-grid2">
            <Campo label="Nome do modelo *"><input value={nome} onChange={(e) => { setSalvo(false); setNome(e.target.value); }} spellCheck lang="pt-BR" placeholder="ex.: PESEIRA ALANA" /></Campo>
            <Campo label="Referência"><input value={ref} onChange={(e) => { setSalvo(false); setRef(e.target.value); }} placeholder="ex.: 1075" /></Campo>
            <Campo label="Galga / parte">
              <select value={parte} onChange={(e) => { setSalvo(false); setParte(Number(e.target.value)); }}>
                <option value={2}>Galga 7 (Parte 2)</option>
                <option value={1}>Galga 3 (Parte 1)</option>
              </select>
            </Campo>
            <Campo label="Composição"><input value={composicao} onChange={(e) => { setSalvo(false); setComposicao(e.target.value); }} spellCheck lang="pt-BR" placeholder="ex.: 100% POLIÉSTER" /></Campo>
          </div>

          {/* Sub-menu do produto: um botão para cada item que o produto usa.
              Fica com ✓ quando a seção já está definida — pra saber que o produto está pronto. */}
          <div className="prod-secoes">
            {SECOES.map((s) => {
              const n = contaSecao(s);
              const ok = secaoDefinida(s);
              return (
                <button key={s.id} type="button" className={"prod-secao-btn" + (secao === s.id ? " on" : "") + (ok ? " ok" : "")} onClick={() => setSecao(secao === s.id ? "" : s.id)}>
                  {ok && <span className="prod-secao-check">✓</span>}
                  {s.nome}{n > 0 ? <span className="prod-secao-badge">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 4px" }}>
            {(() => { const n = SECOES.filter((s) => secaoDefinida(s)).length; return n === 0 ? "Nenhuma seção preenchida ainda" : `${n} seç${n === 1 ? "ão preenchida" : "ões preenchidas"} ✓`; })()}
          </p>

          {secao === "tamanhos" && (<>
          <div className="form-grid2">
            <Campo label="Tamanho">
              <select value="__pick__" onChange={(e) => {
                const v = e.target.value;
                setSalvo(false);
                if (v === "__novo__") { novoTamanho(); return; }
                if (v === "__todos__") { setSelTam((s) => { const n = { ...s }; linhasTam.forEach((t) => (n[t.nome] = true)); return n; }); return; }
                if (v && v !== "__pick__") setSelTam((s) => ({ ...s, [v]: true }));
              }}>
                <option value="__pick__">＋ adicionar tamanho…</option>
                <option value="__todos__">✓ todos os tamanhos</option>
                {linhasTam.filter((t) => !selTam[t.nome]).map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                <option value="__novo__">＋ novo tamanho…</option>
              </select>
            </Campo>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            {tamsProdSel.length === 0 ? (
              <div className="pad empty">Nenhum tamanho selecionado. Use o seletor acima.</div>
            ) : (
              <div className="pad" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {linhasTam.filter((t) => selTam[t.nome]).map((t) => (
                  <span key={t.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {t.nome}
                    <button type="button" className="icon-btn" title="Remover tamanho" style={{ padding: 0, lineHeight: 1 }} onClick={() => { setSalvo(false); setSelTam((s) => ({ ...s, [t.nome]: false })); }}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          </>)}

          {secao === "fio" && (<>
          {/* Tipo de fio do produto (as cores ficam na seção Cores) */}
          <div className="form-grid2">
            <Campo label="Tipo de fio">
              <select value={fioSel ?? "__pick__"} onChange={(e) => setFioSel(e.target.value === "__pick__" ? null : e.target.value)} disabled={fiosLista.length === 0}>
                <option value="__pick__">{fiosLista.length === 0 ? "nenhuma cor cadastrada" : "— escolha o tipo de fio —"}</option>
                {fiosLista.map((f) => {
                  const nsel = selDoFio(f.fio);
                  return <option key={f.fio || "—"} value={f.fio}>{(f.fio || "Sem tipo de fio")} ({f.total} cor{f.total === 1 ? "" : "es"}){nsel > 0 ? ` · ${nsel} marcada${nsel === 1 ? "" : "s"}` : ""}</option>;
                })}
              </select>
            </Campo>
          </div>
          {fiosLista.length > 0 && nForaFio > 0 && fioSel !== null && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ⚠️ {nForaFio} cor(es) marcada(s) em outro tipo de fio.
              <button type="button" className="btn btn-soft" style={{ marginLeft: 8, padding: "2px 9px", fontSize: 11 }} onClick={manterSoDoFio}>manter só deste fio</button>
            </p>
          )}
          {fioSel !== null && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Fio escolhido: <strong>{fioSel || "Sem tipo de fio"}</strong> · {selDoFio(fioSel)} cor(es) marcada(s). Escolha as cores na seção <strong>Cores</strong>.</p>}
          </>)}

          {secao === "cores" && (<>
          {fiosLista.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Nenhuma cor cadastrada. Cadastre cores em <strong>Tipos de fio &amp; Cores</strong>.</p>
          ) : fioSel === null ? (
            <p className="muted" style={{ fontSize: 13 }}>Escolha o <strong>Tipo de fio</strong> na seção anterior para listar as cores.</p>
          ) : (() => {
            const g = grupos.find((gg) => gg.fio === fioSel);
            const coresF = g ? g.cores : [];
            const todasMarc = coresF.length > 0 && coresF.every((c) => sel.has(c.nome));
            return (
              <div className="card">
                <div className="fio-item-h" style={{ cursor: "default" }}>
                  <span className="fio-item-nm">{fioSel || "Sem tipo de fio"}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{coresF.length} cor(es)</span>
                  {selDoFio(fioSel) > 0 && <span className="chip" style={{ background: "#dcfce7", color: "#166534" }}>{selDoFio(fioSel)} ✓</span>}
                  <button type="button" className="btn btn-soft" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }} onClick={() => toggleGrupo(coresF)}>
                    {todasMarc ? "desmarcar todas" : "selecionar todas"}
                  </button>
                </div>
                <table className="table">
                  <tbody>
                    {coresF.length === 0 ? (
                      <tr><td colSpan={3} className="empty pad">Nenhuma cor nesse tipo de fio{filtro ? " com esse filtro" : ""}.</td></tr>
                    ) : coresF.map((c) => {
                      const on = sel.has(c.nome);
                      return (
                        <tr key={c.nome} style={{ opacity: on ? 1 : 0.6, cursor: "pointer" }} onClick={() => toggleCor(c.nome)}>
                          <td style={{ width: 40 }}><input type="checkbox" checked={on} readOnly /></td>
                          <td className="strong">{c.nome}</td>
                          <td><span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{c.codigo || "—"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
          </>)}

          {secao === "tempo" && (
            tamsProdSel.length === 0
              ? <p className="muted" style={{ fontSize: 13 }}>Selecione tamanhos na seção <strong>Tamanhos</strong>.</p>
              : <div className="card" style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead><tr><th>Tamanho</th><th className="num">Tempo (min)</th></tr></thead>
                    <tbody>
                      {linhasTam.filter((t) => selTam[t.nome]).map((t) => (
                        <tr key={t.id}>
                          <td className="strong">{t.nome}</td>
                          <td className="num"><span className="row-gap" style={{ gap: 4, alignItems: "center", justifyContent: "flex-end" }}><input className="w-xs num" type="number" min={0} step="any" value={tempos[t.nome] ?? ""} onChange={(e) => { setSalvo(false); setTempos((p) => ({ ...p, [t.nome]: e.target.value })); }} /><span className="muted" style={{ fontSize: 12 }}>min</span></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          )}

          {secao === "peso" && (
            tamsProdSel.length === 0
              ? <p className="muted" style={{ fontSize: 13 }}>Selecione tamanhos na seção <strong>Tamanhos</strong>.</p>
              : <div className="card" style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead><tr><th>Tamanho</th><th className="num">Fio (kg)</th></tr></thead>
                    <tbody>
                      {linhasTam.filter((t) => selTam[t.nome]).map((t) => (
                        <tr key={t.id}>
                          <td className="strong">{t.nome}</td>
                          <td className="num"><span className="row-gap" style={{ gap: 4, alignItems: "center", justifyContent: "flex-end" }}><input className="w-xs num" type="number" min={0} step="any" value={pesos[t.nome] ?? ""} onChange={(e) => { setSalvo(false); setPesos((p) => ({ ...p, [t.nome]: e.target.value })); }} /><span className="muted" style={{ fontSize: 12 }}>kg</span></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          )}

          {SECOES.filter((s) => s.cat).map((s) => secao === s.id && (
            <div key={s.id}>{s.id === "ziper" ? renderZiper() : renderMateriaisSecao(s.cat!, s.nome)}</div>
          ))}

          {/* Footer */}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16, alignItems: "center" }}>
            <span className="muted" style={{ marginRight: "auto", fontSize: 13 }}>
              <strong>{nCores}</strong> cores × <strong>{nTam}</strong> tamanhos = <strong>{nCores * nTam}</strong> variações
            </span>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" style={{ background: "#16a34a" }} disabled={salvando} onClick={salvar}>
              {salvando ? "Salvando…" : refNome ? "✔ Salvar alterações" : "✔ Salvar produto"}
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
  const [colar, setColar] = useState("");
  const [colarFio, setColarFio] = useState(false);
  const [processando, setProcessando] = useState(false);

  function recarregar() {
    api.listarTiposFio().then(setTipos).catch(() => {});
    api.listarCores().then(setCores).catch(() => {});
  }
  async function processarColar(fioId: string) {
    if (!colar.trim()) return;
    setProcessando(true);
    try {
      const r = await api.bulkCores(colar, fioId || null);
      setColar("");
      recarregar();
      alert(`${r.criados} cor(es) adicionada(s).${r.ignorados ? ` ${r.ignorados} já existia(m) e foram atualizadas.` : ""}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProcessando(false);
    }
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
      await api.salvarTipoFio({ id: fioForm.id || undefined, nome: capFirst(fioForm.nome), fornecedor_id: fioForm.fornId || null, cor: fioForm.cor });
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

        <div className="card pad" style={{ marginBottom: 14 }}>
          <h2 style={{ marginTop: 0 }}>Colar várias cores {fio ? `em ${fio.nome}` : ""}</h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 10 }}>
            Uma cor por linha. Se colar da planilha (nome numa coluna e código na outra), eu separo sozinho.
            Todas entram <strong>{fio ? `no fio ${fio.nome}` : "sem tipo de fio"}</strong>.
          </p>
          <textarea
            value={colar}
            onChange={(e) => setColar(e.target.value)}
            placeholder={"ROMENIA\nAZUL MARINHO 1075\nPRETO; PT-01\nVERDE, 2043"}
            rows={4}
            style={{ width: "100%", resize: "vertical" }}
          />
          <div className="row-gap" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-primary" disabled={processando || !colar.trim()} onClick={() => processarColar(aberto)}>{processando ? "Processando…" : "✓ Adicionar cores"}</button>
          </div>
        </div>

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
                  <td><span className="strong">{c.nome}</span></td>
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
        <button className="btn btn-soft" onClick={() => setColarFio(true)}>📋 Colar em massa</button>
        <button className="btn btn-primary" onClick={() => setFioForm({ id: null, nome: "", fornId: "", cor: CORES_FIO[0] })}>＋ Novo tipo de fio</button>
      </div>

      {fioForm && (
        <div className="card pad" style={{ marginBottom: 14 }}>
          <h2>{fioForm.id ? "Editar tipo de fio" : "Novo tipo de fio"}</h2>
          <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
            <label className="fld">Nome<input autoFocus spellCheck lang="pt-BR" value={fioForm.nome} onChange={(e) => setFioForm({ ...fioForm, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarFio()} style={{ minWidth: 200 }} /></label>
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
            <button className="icon-btn" title="Duplicar" onClick={(e) => { e.stopPropagation(); setFioForm({ id: null, nome: t.nome, fornId: t.fornecedor_id || "", cor: t.cor || CORES_FIO[0] }); }}>⧉</button>
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
      {colarFio && <ColarEmMassa
        titulo="Colar tipos de fio em massa"
        colunas="nome · cor (hex) · preço (por kg)"
        exemplo="Polisoft;#7c3aed;28,50"
        onColar={api.bulkTiposFio}
        onUndo={(ids) => Promise.all(ids.map((id) => api.excluirTipoFio(id))).then(() => {})}
        onFechar={() => setColarFio(false)}
        onSalvo={recarregar}
      />}
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
const UNIDADES = ["un", "kg", "g", "m", "cm", "par", "rolo", "pacote", "caixa"];
const CORES_INSUMO = ["#0891b2", "#7c3aed", "#ca8a04", "#16a34a", "#ea580c", "#db2777", "#2563eb", "#dc2626", "#64748b"];

// Cada TIPO de material define suas COLUNAS — e as MESMAS colunas valem no
// formulário, na tabela e no colar em massa. Chaves possíveis: nome, codigo_interno,
// tamanho, cor, codigo, unidade, preco, minimo, fornecedor, status, obs e
// extra:<chave> (campo próprio do tipo, guardado no JSON `extra`).
// Tipos com `colunas` mostram SÓ essas colunas; os demais usam colunasPadrao().
type ColDef = { key: string; label: string; ph?: string; width?: number; default?: string };
// `variacao` = qual campo do material é a "variação" dele na ficha do produto
// (ex.: zíper → comprimento; forro/refil → tamanho; embalagem → medida interna).
const CAMPOS_POR_TIPO: Record<string, { cor?: boolean; campos?: ColDef[]; colunas?: ColDef[]; nomeTemplate?: string; variacao?: string }> = {
  ziper: { variacao: "extra:comprimento", colunas: [
    { key: "nome", label: "Nome", ph: "ex.: Zíper Invisível", width: 190 },
    { key: "cor", label: "Cor do tricô", ph: "ex.: Off White", width: 150 },
    { key: "codigo", label: "Código do fabricante", ph: "ex.: P-296", width: 180 },
    { key: "extra:comprimento", label: "Comprimento", ph: "ex.: 50 cm", width: 110 },
    { key: "unidade", label: "Un", width: 80 },
    { key: "preco", label: "Preço (R$)", ph: "0,64", width: 100 },
    { key: "minimo", label: "Estoque mín.", width: 90 },
    { key: "fornecedor", label: "Fornecedor", width: 160 },
    { key: "status", label: "Status", width: 100 },
  ] },
  etiqueta: { colunas: [
    { key: "nome", label: "Nome", ph: "ex.: Etiqueta 20x75 mm", width: 200 },
    { key: "tamanho", label: "Tamanho", ph: "ex.: 20X75 MM", width: 130 },
    { key: "unidade", label: "Un", width: 80 },
    { key: "preco", label: "Preço (R$)", ph: "0,14", width: 100 },
    { key: "minimo", label: "Estoque mín.", width: 90 },
    { key: "fornecedor", label: "Fornecedor", width: 160 },
    { key: "status", label: "Status", width: 100 },
  ] },
  forro: { colunas: [
    { key: "nome", label: "Nome", ph: "ex.: Forro TNT", width: 180 },
    { key: "tamanho", label: "Tamanho", ph: "ex.: 50x50", width: 110 },
    { key: "extra:largura", label: "Largura", ph: "ex.: 50 cm", width: 100 },
    { key: "extra:comprimento", label: "Comprimento", ph: "ex.: 50 cm", width: 110 },
    { key: "cor", label: "Cor do Tricô", ph: "ex.: Terracota", width: 140 },
    { key: "extra:cor_forro", label: "Cor do Forro", ph: "ex.: Terracota", width: 140 },
    { key: "preco", label: "Valor Unitário", ph: "R$ 2,35", width: 120 },
    { key: "unidade", label: "Unidade", width: 90 },
    { key: "fornecedor", label: "Fornecedor", width: 160 },
    { key: "minimo", label: "Estoque mín.", width: 90 },
    { key: "status", label: "Status", width: 100 },
  ] },
  refil: { nomeTemplate: "Refil {tamanho}", colunas: [
    { key: "extra:almofada", label: "Tamanho da almofada", ph: "ex.: 45x45", width: 160 },
    { key: "tamanho", label: "Tamanho do refil", ph: "ex.: 50x50 (ou 'Não usa refil')", width: 200 },
    { key: "extra:peso", label: "Peso", ph: "ex.: 300 g", width: 100 },
    { key: "unidade", label: "Un", width: 80 },
    { key: "preco", label: "Preço (R$)", width: 100 },
    { key: "minimo", label: "Estoque mín.", width: 90 },
    { key: "fornecedor", label: "Fornecedor", width: 160 },
    { key: "status", label: "Status", width: 100 },
  ] },
  encarte: { colunas: [
    { key: "nome", label: "Nome do encarte", ph: "ex.: Encarte padrão", width: 180 },
    { key: "tamanho", label: "Tamanho", ph: "ex.: 60x1.50", width: 120 },
    { key: "unidade", label: "Unidade", width: 90 },
    { key: "extra:pedido_minimo", label: "Pedido mínimo", ph: "ex.: 100", width: 110 },
    { key: "preco", label: "Valor", ph: "R$ 0,00", width: 100 },
    { key: "minimo", label: "Estoque mínimo", width: 120 },
    { key: "fornecedor", label: "Fornecedor", width: 160 },
  ] },
  embalagem: { variacao: "extra:medida_interna", colunas: [
    { key: "codigo_interno", label: "Código", ph: "ex.: EMB-001", width: 110 },
    { key: "nome", label: "Descrição", ph: "ex.: Embalagem 50x50", width: 190 },
    { key: "extra:tipo", label: "Tipo", default: "PVC", width: 90 },
    { key: "extra:bolso", label: "Bolso", ph: "ex.: Sim", width: 90 },
    { key: "extra:silk", label: "Silk", ph: "ex.: Sim", width: 90 },
    { key: "extra:medida_fabricante", label: "Medida fabricante", ph: "ex.: 52x52", width: 150 },
    { key: "extra:medida_interna", label: "Medida interna", ph: "ex.: 50x50", width: 150 },
    { key: "preco", label: "Valor", ph: "R$ 0,00", width: 100 },
    { key: "minimo", label: "Estoque mínimo", width: 120 },
    { key: "fornecedor", label: "Fabricante", width: 160 },
  ] },
  tag:       { campos: [{ key: "extra:modelo", label: "Modelo", ph: "ex.: Kraft redonda", width: 160 }] },
  tabuleiro: { campos: [{ key: "extra:medida", label: "Medida", ph: "ex.: 45x45", width: 110 }] },
  linha:     { cor: true },
};
// Colunas padrão (tipos sem layout próprio): campos comuns + cor/extras do cfg.
function colunasPadrao(cfg: { cor?: boolean; campos?: ColDef[] }): ColDef[] {
  const cor = cfg.cor ? [{ key: "cor", label: "Cor", width: 110 }, { key: "codigo", label: "Código", width: 100 }] : [];
  return [
    { key: "nome", label: "Nome", width: 190 },
    { key: "codigo_interno", label: "Cód. interno", width: 100 },
    { key: "tamanho", label: "Tamanho", width: 120 },
    ...cor, ...(cfg.campos || []),
    { key: "unidade", label: "Unidade", width: 90 },
    { key: "preco", label: "Preço (R$)", width: 100 },
    { key: "minimo", label: "Estoque mín.", width: 90 },
    { key: "fornecedor", label: "Fornecedor", width: 170 },
    { key: "status", label: "Status", width: 100 },
    { key: "obs", label: "Observações", width: 200 },
  ];
}
// Valor de exemplo para cada coluna (usado no placeholder do colar em massa).
function exemploColuna(c: ColDef, tipoNome: string): string {
  if (c.default) return c.default;
  switch (c.key) {
    case "nome": return `${tipoNome} exemplo`;
    case "cor": return "Off White";
    case "codigo": return "P-296";
    case "codigo_interno": return "SKU-01";
    case "unidade": return "un";
    case "preco": return c.ph || "0,00";
    case "minimo": return "";
    case "fornecedor": return "Forros Brasil";
    case "status": return "ativo";
    default: return c.key.startsWith("extra:") ? (c.ph || "").replace(/^ex\.:\s*/, "") : "";
  }
}
// Primeira letra maiúscula (mantém o resto como está). Ex.: "off white" → "Off white".
const capFirst = (s: string) => { const t = (s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
const nBR = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const rBR = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AbaMateriais() {
  // Insumos CADASTRÁVEIS: cada categoria é uma sub-aba (dinâmica) com sua própria
  // tela e controle de estoque. O submenu do topo faz deep-link via ?mat=<slug>.
  // ?mat=__compras abre a lista de compras (saldo abaixo do mínimo).
  const [sp] = useSearchParams();
  const [cats, setCats] = useState<MaterialCategoriaDef[]>([]);
  const [cat, setCat] = useState<string>(sp.get("mat") || "");
  const [modal, setModal] = useState<MaterialCategoriaDef | "novo" | null>(null);
  const [todos, setTodos] = useState<Material[]>([]);

  function recarregarCats() { return api.listarCategoriasMaterial().then((cs) => { setCats(cs); return cs; }); }
  function recarregarKpis() { api.listarMateriais().then(setTodos).catch(() => {}); }
  useEffect(() => { recarregarCats().then((cs) => { if (!sp.get("mat") && cs[0]) setCat(cs[0].slug); }); recarregarKpis(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const q = sp.get("mat"); if (q) setCat(q); }, [sp]);

  const nAtivos = todos.filter((m) => m.status !== "inativo").length;
  const nBaixo = todos.filter((m) => (m.minimo || 0) > 0 && (m.saldo || 0) < (m.minimo || 0)).length;
  const valorEstoque = todos.reduce((s, m) => s + (m.saldo || 0) * (m.preco || 0), 0);

  const meta = cats.find((c) => c.slug === cat) || null;
  return (
    <>
      <div className="prod-kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-v">{nAtivos}</div><div className="kpi-l">Materiais ativos</div></div>
        <div className="kpi"><div className="kpi-v" style={{ color: nBaixo ? "#dc2626" : undefined }}>{nBaixo}</div><div className="kpi-l">Abaixo do mínimo</div></div>
        <div className="kpi"><div className="kpi-v">{rBR(valorEstoque)}</div><div className="kpi-l">Valor em estoque</div></div>
      </div>
      <div className="segmented" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {cats.map((c) => (
          <button type="button" key={c.slug} className={"seg" + (cat === c.slug ? " seg-on" : "")} onClick={() => setCat(c.slug)}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: c.cor || "#64748b", marginRight: 7 }} />{c.nome}
          </button>
        ))}
        <button type="button" className={"seg" + (cat === "__compras" ? " seg-on" : "")} onClick={() => setCat("__compras")}>🛒 Compras</button>
        <button type="button" className="seg" style={{ fontWeight: 700, color: "#4338ca" }} onClick={() => setModal("novo")}>＋ Novo insumo</button>
      </div>

      {cat === "__compras" ? (
        <ComprasMateriais />
      ) : meta ? (
        <CadastroMaterial
          key={meta.slug} cat={meta} onMudou={recarregarKpis}
          onEditarCat={() => setModal(meta)}
          onExcluirCat={async () => {
            if (!confirm(`Excluir o insumo "${meta.nome}"? (só se estiver vazio)`)) return;
            try { await api.excluirCategoriaMaterial(meta.id); const cs = await recarregarCats(); setCat(cs[0]?.slug || ""); }
            catch (e) { alert((e as Error).message); }
          }}
        />
      ) : (
        <div className="card pad muted">Escolha um insumo acima ou crie um novo.</div>
      )}

      {modal && (
        <InsumoModal
          cat={modal === "novo" ? null : modal}
          onFechar={() => setModal(null)}
          onSalvo={(slug) => { setModal(null); recarregarCats(); setCat(slug); }}
        />
      )}
    </>
  );
}

// Modal de cadastro/edição de um INSUMO (categoria de material).
function InsumoModal({ cat, onFechar, onSalvo }: { cat: MaterialCategoriaDef | null; onFechar: () => void; onSalvo: (slug: string) => void }) {
  const [nome, setNome] = useState(cat?.nome || "");
  const [cor, setCor] = useState(cat?.cor || CORES_INSUMO[0]);
  const [icone, setIcone] = useState(cat?.icone || "");
  async function salvar() {
    if (!nome.trim()) return alert("Informe o nome do insumo.");
    try { const r = await api.salvarCategoriaMaterial({ id: cat?.id, nome: nome.trim(), cor, icone: icone.trim() || null }); onSalvo(r.slug); }
    catch (e) { alert((e as Error).message); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{cat ? "Editar insumo" : "Novo insumo"}</h2>
        <p className="muted" style={{ marginTop: -4 }}>Ele aparece sozinho no menu Materiais e como sub-aba.</p>
        <label className="campo"><span className="campo-label">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Botão, Linha, Viés" autoFocus spellCheck lang="pt-BR" /></label>
        <label className="campo"><span className="campo-label">Ícone (emoji, opcional)</span>
          <input value={icone} onChange={(e) => setIcone(e.target.value)} placeholder="ex.: 🔘" style={{ width: 90 }} /></label>
        <div className="campo"><span className="campo-label">Cor</span>
          <div className="row-gap" style={{ flexWrap: "wrap", gap: 6 }}>
            {CORES_INSUMO.map((c) => (
              <button key={c} type="button" onClick={() => setCor(c)} title={c}
                style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: cor === c ? "3px solid #0f172a" : "2px solid #fff", boxShadow: "0 0 0 1px #d7dbe3", cursor: "pointer" }} />
            ))}
          </div>
        </div>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>{cat ? "Salvar" : "Criar insumo"}</button>
        </div>
      </div>
    </div>
  );
}

// Tela de cadastro + ESTOQUE de UM insumo. Controla saldo/mínimo/preço p/ compras.
function CadastroMaterial({ cat, onEditarCat, onExcluirCat, onMudou }: { cat: MaterialCategoriaDef; onEditarCat: () => void; onExcluirCat: () => void; onMudou?: () => void }) {
  const categoria = cat.slug, label = cat.nome, catCor = cat.cor || "#64748b";
  const cfg = CAMPOS_POR_TIPO[categoria] || {};
  const colunas: ColDef[] = cfg.colunas || colunasPadrao(cfg);
  const temCor = colunas.some((c) => c.key === "cor");
  const extraKeys = colunas.filter((c) => c.key.startsWith("extra:")).map((c) => c.key.slice(6));
  const semNome = !colunas.some((c) => c.key === "nome"); // tipos com nome automático (refil)
  // Valores padrão de coluna (ex.: embalagem tipo = "PVC").
  const colDefaults: Record<string, string> = {};
  for (const c of colunas) if (c.default) colDefaults[c.key] = c.default;
  const extraDefaults: Record<string, string> = {};
  for (const c of colunas) if (c.default && c.key.startsWith("extra:")) extraDefaults[c.key.slice(6)] = c.default;
  // Colar em massa: mesmas colunas do tipo (fornecedor entra por NOME — cria se não existir).
  const bulkCols = colunas.map((c) => c.key);
  const bulkLabels = colunas.map((c) => c.label);
  const bulkLabel = colunas.map((c) => c.label.toLowerCase()).join(" · ");
  const bulkEx = colunas.map((c) => exemploColuna(c, cat.nome)).join(";");
  const [itens, setItens] = useState<Material[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [fornId, setFornId] = useState("");
  const [cor, setCor] = useState("");
  const [codigo, setCodigo] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [preco, setPreco] = useState("");
  const [minimo, setMinimo] = useState("");
  const [codInterno, setCodInterno] = useState("");
  const [status, setStatus] = useState("ativo");
  const [obs, setObs] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>(extraDefaults);
  const [novoForn, setNovoForn] = useState(false);
  const [entrada, setEntrada] = useState<Material | null>(null);
  const [colar, setColar] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set()); // seleção p/ alterar em massa
  const [alterar, setAlterar] = useState(false);
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Desfazer a última importação MESMO depois de fechar o modal: guardo os ids
  // criados no localStorage (por tipo). Some quando é desfeita ou substituída.
  const undoKey = `mat-undo-${categoria}`;
  const [undoIds, setUndoIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(undoKey) || "[]"); } catch { return []; } });
  function salvarUndo(ids: string[]) { setUndoIds(ids); localStorage.setItem(undoKey, JSON.stringify(ids)); }
  function limparUndo() { setUndoIds([]); localStorage.removeItem(undoKey); }
  async function desfazerImport() {
    if (!undoIds.length) return;
    if (!confirm(`Desfazer a última importação? Isso apaga os ${undoIds.length} ${label.toLowerCase()}(s) que ela criou.`)) return;
    try { await Promise.all(undoIds.map((id) => api.excluirMaterial(id))); limparUndo(); recarregar(); onMudou?.(); }
    catch (e) { alert((e as Error).message); }
  }
  async function excluirTodos() {
    if (!itens.length) return;
    if (!confirm(`Excluir TODOS os ${itens.length} ${label.toLowerCase()}(s) deste tipo? Não dá pra desfazer.`)) return;
    try { await api.excluirTodosMateriais(categoria); limparUndo(); recarregar(); onMudou?.(); }
    catch (e) { alert((e as Error).message); }
  }

  function parseExtra(m: Material): Record<string, string> {
    if (!m.extra) return {};
    try { const o = JSON.parse(m.extra); return o && typeof o === "object" ? o : {}; } catch { return {}; }
  }
  function recarregar() { api.listarMateriais(categoria).then(setItens).catch(() => {}); }
  function recarregarForn() { return api.listarFornecedores().then(setFornecedores).catch(() => {}); }
  useEffect(() => { recarregar(); recarregarForn(); /* eslint-disable-next-line */ }, [categoria]);

  function limpar() {
    setEditId(null); setNome(""); setTamanho(""); setFornId(""); setCor(""); setCodigo("");
    setUnidade("un"); setPreco(""); setMinimo(""); setCodInterno(""); setStatus("ativo"); setObs(""); setExtra(extraDefaults);
  }
  function editar(m: Material) {
    setEditId(m.id); setNome(m.nome); setTamanho(m.tamanho || ""); setFornId(m.fornecedor_id || "");
    setCor(m.cor || ""); setCodigo(m.codigo || "");
    setUnidade(m.unidade || "un"); setPreco(m.preco != null ? String(m.preco) : ""); setMinimo(m.minimo != null ? String(m.minimo) : "");
    setCodInterno(m.codigo_interno || ""); setStatus(m.status === "inativo" ? "inativo" : "ativo"); setObs(m.obs || ""); setExtra({ ...extraDefaults, ...parseExtra(m) });
  }

  // Lê/escreve o valor de uma coluna sobre os estados individuais.
  function getV(key: string): string {
    if (key.startsWith("extra:")) return extra[key.slice(6)] || "";
    return ({ nome, codigo_interno: codInterno, tamanho, cor, codigo, unidade, preco, minimo, status, obs } as Record<string, string>)[key] ?? "";
  }
  function setV(key: string, v: string) {
    if (key.startsWith("extra:")) { const k = key.slice(6); setExtra((x) => ({ ...x, [k]: v })); return; }
    ({ nome: setNome, codigo_interno: setCodInterno, tamanho: setTamanho, cor: setCor, codigo: setCodigo, unidade: setUnidade, preco: setPreco, minimo: setMinimo, status: setStatus, obs: setObs } as Record<string, (v: string) => void>)[key]?.(v);
  }

  // Nome final: manual (coluna "nome") ou automático via template (ex.: "Refil {tamanho}").
  function nomeFinal(): string {
    if (!semNome) return nome.trim();
    if (!cfg.nomeTemplate) return "";
    return cfg.nomeTemplate.replace(/\{(\w+)\}/g, (_s, k: string) => getV(k) || getV("extra:" + k)).trim();
  }
  async function salvar() {
    const nomeM = nomeFinal();
    if (!nomeM) return alert(semNome ? `Preencha os campos do ${label.toLowerCase()}.` : "Informe o nome do material.");
    // extra: só as chaves de coluna deste tipo, sem valores vazios.
    const extraLimpo: Record<string, string> = {};
    for (const k of extraKeys) { const v = (extra[k] || "").trim(); if (v) extraLimpo[k] = v; }
    try {
      await api.salvarMaterial({
        id: editId || undefined, categoria, nome: capFirst(nomeM), tamanho: tamanho.trim() || null, fornecedor_id: fornId || null,
        cor: temCor ? (capFirst(cor) || null) : null, cor_hex: null, codigo: temCor ? (codigo.trim() || null) : null,
        unidade, preco: preco.trim() ? Number(preco.replace(",", ".")) : null, minimo: minimo.trim() ? Number(minimo.replace(",", ".")) : 0,
        codigo_interno: codInterno.trim() || null, status, obs: obs.trim() || null,
        extra: JSON.stringify(extraLimpo),
      });
      limpar(); recarregar(); onMudou?.();
    } catch (e) { alert((e as Error).message); }
  }
  async function remover(m: Material) {
    if (!confirm(`Excluir "${m.nome}${m.tamanho ? " " + m.tamanho : ""}"?`)) return;
    try { await api.excluirMaterial(m.id); if (editId === m.id) limpar(); recarregar(); onMudou?.(); } catch (e) { alert((e as Error).message); }
  }
  // Duplicar: carrega os dados no formulário como um NOVO cadastro (editId nulo).
  function duplicar(m: Material) {
    editar(m);
    setEditId(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="row-gap" style={{ alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{editId ? `Editar ${label.toLowerCase()}` : `Novo ${label.toLowerCase()}`}</h2>
          <span style={{ marginLeft: "auto" }} />
          {undoIds.length > 0 && (
            <button className="btn btn-soft" title="Desfazer a última importação (apaga só o que ela criou)" onClick={desfazerImport}
              style={{ color: "#b91c1c", borderColor: "#fca5a5" }}>↩️ Desfazer importação ({undoIds.length})</button>
          )}
          <button className="btn btn-soft" title="Colar vários de uma vez" onClick={() => setColar(true)}>📋 Colar em massa</button>
          {sel.size > 0 && <button className="btn btn-soft" title="Alterar um campo dos selecionados" onClick={() => setAlterar(true)} style={{ color: "#4338ca", borderColor: "#c7d2fe" }}>✏️ Alterar em massa ({sel.size})</button>}
          {itens.length > 0 && <button className="btn btn-soft" title="Excluir todos deste tipo" onClick={excluirTodos} style={{ color: "#b91c1c" }}>🗑 Excluir todos</button>}
          <button className="btn btn-soft" title="Renomear insumo" onClick={onEditarCat}>✎ Insumo</button>
          <button className="btn" title="Excluir insumo" onClick={onExcluirCat}>🗑</button>
        </div>
        <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          {colunas.map((c) => {
            if (c.key === "fornecedor") return (
              <label className="fld" key={c.key}>{c.label}
                <div className="row-gap" style={{ gap: 4 }}>
                  <select value={fornId} onChange={(e) => setFornId(e.target.value)} style={{ minWidth: 150 }}>
                    <option value="">Sem fornecedor</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                  <button type="button" className="btn btn-soft" title="Novo fornecedor" onClick={() => setNovoForn(true)} style={{ padding: "8px 11px" }}>＋</button>
                </div>
              </label>
            );
            if (c.key === "unidade") return (
              <label className="fld" key={c.key}>{c.label}
                <select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={{ width: c.width || 90 }}>
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            );
            if (c.key === "status") return (
              <label className="fld" key={c.key}>{c.label}
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: c.width || 100 }}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            );
            const decimal = c.key === "preco" || c.key === "minimo";
            const corrige = c.key === "nome" || c.key === "cor" || c.key === "obs"; // corretor ortográfico só em texto
            return (
              <label className="fld" key={c.key} style={c.key === "obs" ? { flex: 1, minWidth: 180 } : undefined}>{c.label}
                <input value={getV(c.key)} onChange={(e) => setV(c.key, e.target.value)} placeholder={c.ph || (c.key === "nome" ? `ex.: ${label}` : "")}
                  inputMode={decimal ? "decimal" : undefined} spellCheck={corrige} lang={corrige ? "pt-BR" : undefined} style={{ width: c.width || 130 }} />
              </label>
            );
          })}
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
          <thead><tr>
            <th style={{ width: 30 }}><input type="checkbox" title="Selecionar todos" checked={itens.length > 0 && sel.size === itens.length}
              onChange={(e) => setSel(e.target.checked ? new Set(itens.map((m) => m.id)) : new Set())} /></th>
            {colunas.map((c) => <th key={c.key} className={c.key === "preco" || c.key === "minimo" ? "num" : undefined}>{c.label}</th>)}
            <th className="num">Estoque</th><th></th>
          </tr></thead>
          <tbody>
            {itens.length === 0 ? (
              <tr><td colSpan={colunas.length + 3} className="empty pad">Nenhum {label.toLowerCase()} cadastrado ainda.</td></tr>
            ) : itens.map((m) => {
              const saldo = m.saldo || 0, min = m.minimo || 0, baixo = min > 0 && saldo < min;
              const mx: Record<string, string> = (() => { try { return m.extra ? JSON.parse(m.extra) : {}; } catch { return {}; } })();
              const inativo = m.status === "inativo";
              const celula = (c: ColDef): React.ReactNode => {
                if (c.key === "nome") return <span className="strong">{m.nome}</span>;
                if (c.key === "cor") return m.cor || "—";
                if (c.key === "codigo") return m.codigo ? <span className="chip" style={{ fontFamily: "ui-monospace, monospace" }}>{m.codigo}</span> : "—";
                if (c.key === "codigo_interno") return m.codigo_interno ? <span style={{ fontFamily: "ui-monospace, monospace" }}>{m.codigo_interno}</span> : "—";
                if (c.key === "tamanho") return m.tamanho || "—";
                if (c.key === "unidade") return m.unidade || "—";
                if (c.key === "preco") return m.preco != null ? rBR(m.preco) : "—";
                if (c.key === "minimo") return min > 0 ? nBR(min) : "—";
                if (c.key === "fornecedor") return m.fornecedor_nome || "—";
                if (c.key === "status") return inativo ? <span className="chip" style={{ background: "#e2e8f0", color: "#475569" }}>Inativo</span> : "Ativo";
                if (c.key === "obs") return m.obs || "—";
                if (c.key.startsWith("extra:")) return mx[c.key.slice(6)] || "—";
                return "—";
              };
              return (
                <tr key={m.id} style={inativo ? { opacity: 0.55 } : undefined}>
                  <td><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggleSel(m.id)} /></td>
                  {colunas.map((c) => <td key={c.key} className={c.key === "preco" || c.key === "minimo" ? "num" : undefined}>{celula(c)}</td>)}
                  <td className="num">
                    <span className={baixo ? "mat-saldo-baixo" : ""}>{nBR(saldo)} {m.unidade || ""}</span>
                    {min > 0 && <div className="muted" style={{ fontSize: 10.5 }}>mín {nBR(min)}{baixo ? " · repor" : ""}</div>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="icon-btn" title="Entrada de estoque" onClick={() => setEntrada(m)}>📥</button>
                    <button className="icon-btn" title="Duplicar" onClick={() => duplicar(m)}>⧉</button>
                    <button className="icon-btn" title="Editar" onClick={() => editar(m)}>✎</button>
                    <button className="icon-btn" title="Excluir" onClick={() => remover(m)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {novoForn && <FornecedorRapido onFechar={() => setNovoForn(false)} onSalvo={async (id) => { setNovoForn(false); await recarregarForn(); setFornId(id); }} />}
      {entrada && <MovEstoqueModal material={entrada} onFechar={() => setEntrada(null)} onSalvo={() => { setEntrada(null); recarregar(); onMudou?.(); }} />}
      {alterar && <AlterarMassaModal
        colunas={colunas} ids={[...sel]} fornecedores={fornecedores}
        onFechar={() => setAlterar(false)}
        onSalvo={(n) => { setAlterar(false); setSel(new Set()); recarregar(); onMudou?.(); alert(`${n} item(ns) alterado(s).`); }}
      />}
      {colar && <ColarEmMassa
        titulo={`Colar ${label.toLowerCase()} em massa`}
        colunas={bulkLabel}
        exemplo={bulkEx}
        onColar={async (texto) => { const r = await api.bulkMateriais(categoria, texto, { colunas: bulkCols, labels: bulkLabels, nomeTemplate: cfg.nomeTemplate, defaults: colDefaults }); if (r.ids?.length) salvarUndo(r.ids); return r; }}
        onUndo={(ids) => Promise.all(ids.map((id) => api.excluirMaterial(id))).then(() => { limparUndo(); })}
        onFechar={() => setColar(false)}
        onSalvo={() => { recarregar(); onMudou?.(); }}
      />}
    </>
  );
}

// Modal rápido: cadastra um fornecedor sem sair da tela de material.
function FornecedorRapido({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (id: string) => void }) {
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  async function salvar() {
    if (!nome.trim()) return alert("Informe o nome do fornecedor.");
    try { const r = await api.salvarFornecedor({ nome: nome.trim(), contato: contato.trim() || null, ativo: 1 }); onSalvo(r.id); }
    catch (e) { alert((e as Error).message); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Novo fornecedor</h2>
        <label className="campo"><span className="campo-label">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Coats" autoFocus spellCheck lang="pt-BR" /></label>
        <label className="campo"><span className="campo-label">Contato (opcional)</span>
          <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="telefone / e-mail" /></label>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// Modal de movimentação de estoque (entrada de compra / baixa / ajuste).
function MovEstoqueModal({ material, onFechar, onSalvo }: { material: Material; onFechar: () => void; onSalvo: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "baixa" | "ajuste">("entrada");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const un = material.unidade || "";
  async function salvar() {
    const q = Number(qtd.replace(",", "."));
    if (!q || isNaN(q)) return alert("Informe a quantidade.");
    try { await api.movMaterial(material.id, { tipo, quantidade: q, motivo: motivo.trim() || undefined }); onSalvo(); }
    catch (e) { alert((e as Error).message); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 430 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Estoque · {material.nome}</h2>
        <p className="muted" style={{ marginTop: -4 }}>Saldo atual: <strong>{nBR(material.saldo || 0)} {un}</strong></p>
        <div className="segmented" style={{ marginBottom: 12 }}>
          {(["entrada", "baixa", "ajuste"] as const).map((t) => (
            <button key={t} type="button" className={"seg" + (tipo === t ? " seg-on" : "")} onClick={() => setTipo(t)}>
              {t === "entrada" ? "📥 Entrada" : t === "baixa" ? "📤 Baixa" : "⚖️ Ajuste"}
            </button>
          ))}
        </div>
        <label className="campo"><span className="campo-label">{tipo === "ajuste" ? `Novo saldo (${un})` : `Quantidade (${un})`}</span>
          <input value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" inputMode="decimal" autoFocus /></label>
        <label className="campo"><span className="campo-label">Motivo (opcional)</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "entrada" ? "ex.: compra NF 123" : "ex.: perda / acerto"} /></label>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// Alterar EM MASSA: escolhe UM campo e aplica o mesmo valor a todos os selecionados.
function AlterarMassaModal({ colunas, ids, fornecedores, onFechar, onSalvo }: {
  colunas: ColDef[]; ids: string[]; fornecedores: Fornecedor[]; onFechar: () => void; onSalvo: (n: number) => void;
}) {
  const editaveis = colunas.filter((c) => c.key !== "nome"); // nome não altera em massa
  const [campo, setCampo] = useState(editaveis[0]?.key || "preco");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const cur = editaveis.find((c) => c.key === campo);
  async function aplicar() {
    setSalvando(true);
    try { const r = await api.alterarMassaMateriais(ids, campo, valor); onSalvo(r.alterados); }
    catch (e) { alert((e as Error).message); setSalvando(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>✏️ Alterar em massa</h2>
        <p className="muted" style={{ marginTop: -4 }}>Muda <strong>um campo</strong> nos <strong>{ids.length}</strong> itens selecionados.</p>
        <label className="campo"><span className="campo-label">Campo</span>
          <select value={campo} onChange={(e) => { setCampo(e.target.value); setValor(""); }}>
            {editaveis.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="campo"><span className="campo-label">Novo valor {cur ? `(${cur.label})` : ""}</span>
          {campo === "unidade" ? (
            <select value={valor} onChange={(e) => setValor(e.target.value)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : campo === "status" ? (
            <select value={valor} onChange={(e) => setValor(e.target.value)}>
              <option value="ativo">Ativo</option><option value="inativo">Inativo</option>
            </select>
          ) : campo === "fornecedor" ? (
            <>
              <input list="forn-massa" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="digite ou escolha (cria se for novo)" spellCheck lang="pt-BR" autoFocus />
              <datalist id="forn-massa">{fornecedores.map((f) => <option key={f.id} value={f.nome} />)}</datalist>
            </>
          ) : (
            <input value={valor} onChange={(e) => setValor(e.target.value)}
              inputMode={campo === "preco" || campo === "minimo" ? "decimal" : undefined}
              placeholder={campo === "preco" ? "0,00" : cur?.ph || ""} autoFocus />
          )}
        </label>
        <p className="muted" style={{ fontSize: 12 }}>Deixar em branco limpa o campo (exceto unidade/status).</p>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={aplicar} disabled={salvando}>{salvando ? "Aplicando…" : `Aplicar a ${ids.length}`}</button>
        </div>
      </div>
    </div>
  );
}

// ── Ordem de compra: nossos dados (persistidos), fornecedor e itens → impressão ──
type Empresa = { nome: string; cnpj: string; endereco: string; telefone: string; email: string; logo: string };
const EMPRESA_KEY = "empresa-compras";
const EMPRESA_PADRAO: Empresa = {
  nome: "Big Tricot LTDA",
  cnpj: "37.177.019/0001-18",
  endereco: "R. Iracy da Costa Pereira, 264 – Dei Fiori – Monte Sião/MG – CEP 37580-000",
  telefone: "(35) 3633-0984",
  email: "",
  logo: "",
};
function getEmpresa(): Empresa {
  try {
    const e = JSON.parse(localStorage.getItem(EMPRESA_KEY) || "null");
    if (e && typeof e === "object") {
      // só sobrescreve o padrão com campos NÃO vazios que o usuário salvou
      const merged = { ...EMPRESA_PADRAO };
      for (const k of Object.keys(EMPRESA_PADRAO) as (keyof Empresa)[]) if (e[k]) merged[k] = e[k];
      return merged;
    }
  } catch { /* ignore */ }
  return { ...EMPRESA_PADRAO };
}
const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function imprimirOrdemCompra(emp: Empresa, forn: Fornecedor | null, fornNome: string, itens: CompraSugestao[], autoPrint = true) {
  const hoje = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const data = `${p2(hoje.getDate())}/${p2(hoje.getMonth() + 1)}/${hoje.getFullYear()}`;
  const numero = `OC-${hoje.getFullYear()}${p2(hoje.getMonth() + 1)}${p2(hoje.getDate())}-${p2(hoje.getHours())}${p2(hoje.getMinutes())}`;
  const linhas = itens.map((m, i) => {
    const qtd = m.faltam || 0, unit = m.preco || 0, tot = qtd * unit;
    return `<tr><td class="c">${i + 1}</td><td>${escHtml(m.nome)}${m.tamanho ? " · " + escHtml(m.tamanho) : ""}${m.cor ? " · " + escHtml(m.cor) : ""}${m.codigo ? ` <span class="cod">${escHtml(m.codigo)}</span>` : ""}</td><td class="c">${escHtml(m.unidade || "")}</td><td class="r b">${nBR(qtd)}</td><td class="r">${unit ? rBR(unit) : "—"}</td><td class="r">${unit ? rBR(tot) : "—"}</td></tr>`;
  }).join("");
  const total = itens.reduce((s, m) => s + (m.preco || 0) * (m.faltam || 0), 0);
  const li = (label: string, val: unknown) => val ? `<div><span class="lbl">${label}:</span> ${escHtml(val)}</div>` : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${numero}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:24px;font-size:13px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4338ca;padding-bottom:12px}
    .logo{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:26px;letter-spacing:1px;color:#4338ca;line-height:1}
    .logosub{font-size:10px;letter-spacing:4px;color:#6b7280;margin:2px 0 8px}
    .rz{font-weight:700;font-size:15px}.oc{text-align:right}.oc .t{font-size:18px;font-weight:800}
    .box{border:1px solid #d1d5db;border-radius:8px;padding:12px 14px;margin-top:16px}
    .box h2{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}
    .lbl{color:#6b7280}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #d1d5db;padding:7px 9px}th{background:#eef2ff;text-align:left;font-size:11px;text-transform:uppercase;color:#3730a3}
    td.c{text-align:center}td.r{text-align:right}td.b{font-weight:700}
    .cod{font-family:monospace;background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:11px}
    tfoot td{font-weight:800;background:#f9fafb}
    .ass{margin-top:48px;display:flex;justify-content:space-between;gap:40px}
    .ass div{flex:1;border-top:1px solid #9ca3af;text-align:center;padding-top:6px;color:#6b7280;font-size:12px}
    @media print{body{margin:0}.noprint{display:none}}
  </style></head><body>
    <div class="top">
      <div>
        ${emp.logo ? `<img src="${escHtml(emp.logo)}" alt="logo" style="max-height:74px;max-width:260px;margin-bottom:6px">` : `<div class="logo">BIG TRICOT</div><div class="logosub">HOME DECOR</div>`}
        <div class="rz">${escHtml(emp.nome || "Big Tricot LTDA")}</div>
        ${li("CNPJ", emp.cnpj)}${emp.endereco ? `<div>${escHtml(emp.endereco)}</div>` : ""}<div>${[emp.telefone, emp.email].filter(Boolean).map(escHtml).join(" · ")}</div>
      </div>
      <div class="oc"><div class="t">ORDEM DE COMPRA</div><div class="lbl">Nº ${numero}</div><div class="lbl">Data: ${data}</div></div>
    </div>
    <div class="box"><h2>Fornecedor</h2><div><strong>${escHtml(fornNome)}</strong></div>${li("Contato", forn?.contato)}${li("Telefone", forn?.telefone)}${li("E-mail", forn?.email)}${li("CNPJ", forn?.cnpj)}</div>
    <table><thead><tr><th style="width:36px">#</th><th>Material</th><th style="width:56px">Un</th><th style="width:90px">Qtde</th><th style="width:100px">Vlr unit.</th><th style="width:110px">Total</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="5" class="r">Total estimado</td><td class="r">${rBR(total)}</td></tr></tfoot></table>
    <div class="ass"><div>Comprador</div><div>Fornecedor</div></div>
    <div class="noprint" style="margin-top:24px;text-align:center"><button onclick="window.print()" style="padding:10px 18px;font-size:14px;background:#4338ca;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ Imprimir / Salvar PDF</button></div>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Permita pop-ups para gerar a ordem de compra."); return; }
  w.document.write(html); w.document.close(); w.focus();
  if (autoPrint) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 400);
}

// Modal: edita e persiste os NOSSOS dados usados no cabeçalho da ordem de compra.
function EmpresaModal({ onFechar }: { onFechar: () => void }) {
  const [e, setE] = useState<Empresa>(getEmpresa());
  const set = (p: Partial<Empresa>) => setE((o) => ({ ...o, ...p }));
  function salvar() { localStorage.setItem(EMPRESA_KEY, JSON.stringify({ ...e, nome: (e.nome || "Big Tricot").trim() })); onFechar(); }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(ev) => ev.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Nossos dados (cabeçalho da ordem)</h2>
        <p className="muted" style={{ marginTop: -4 }}>Aparecem no topo de toda ordem de compra. Ficam salvos neste navegador.</p>
        <div className="campo"><span className="campo-label">Logotipo</span>
          <div className="row-gap" style={{ alignItems: "center", gap: 12 }}>
            {e.logo
              ? <img src={e.logo} alt="logo" style={{ maxHeight: 54, maxWidth: 180, border: "1px solid #e2e8f0", borderRadius: 6, padding: 4 }} />
              : <span className="muted" style={{ fontSize: 12 }}>Nenhum (usa o texto BIG TRICOT)</span>}
            <label className="btn btn-soft" style={{ cursor: "pointer" }}>
              {e.logo ? "Trocar" : "Enviar logo"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(ev) => {
                const file = ev.target.files?.[0]; if (!file) return;
                const rd = new FileReader(); rd.onload = () => set({ logo: String(rd.result || "") }); rd.readAsDataURL(file);
              }} />
            </label>
            {e.logo && <button type="button" className="btn btn-soft" onClick={() => set({ logo: "" })}>Remover</button>}
          </div>
        </div>
        <label className="campo"><span className="campo-label">Nome / Razão social</span><input value={e.nome} onChange={(ev) => set({ nome: ev.target.value })} spellCheck lang="pt-BR" /></label>
        <label className="campo"><span className="campo-label">CNPJ</span><input value={e.cnpj} onChange={(ev) => set({ cnpj: ev.target.value })} placeholder="00.000.000/0001-00" /></label>
        <label className="campo"><span className="campo-label">Endereço</span><input value={e.endereco} onChange={(ev) => set({ endereco: ev.target.value })} spellCheck lang="pt-BR" /></label>
        <label className="campo"><span className="campo-label">Telefone</span><input value={e.telefone} onChange={(ev) => set({ telefone: ev.target.value })} /></label>
        <label className="campo"><span className="campo-label">E-mail</span><input value={e.email} onChange={(ev) => set({ email: ev.target.value })} /></label>
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// Lista de COMPRAS: materiais abaixo do mínimo, agrupados por fornecedor.
function ComprasMateriais() {
  const [itens, setItens] = useState<CompraSugestao[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [empresaModal, setEmpresaModal] = useState(false);
  const [qtd, setQtd] = useState<Record<string, string>>({}); // "comprar" editável por item
  const [fora, setFora] = useState<Set<string>>(new Set());   // itens desmarcados (não comprar)
  useEffect(() => {
    api.comprasMateriais().then((r) => { setItens(r); setCarregou(true); }).catch(() => setCarregou(true));
    api.listarFornecedores().then(setFornecedores).catch(() => {});
  }, []);

  const incluido = (m: CompraSugestao) => !fora.has(m.id);
  const toggle = (id: string) => setFora((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const qtdDe = (m: CompraSugestao) => {
    const raw = qtd[m.id];
    const n = raw != null ? Number(raw.replace(",", ".")) : (m.faltam || 0);
    return isNaN(n) ? 0 : n;
  };
  const custoItem = (m: CompraSugestao) => incluido(m) ? (m.preco || 0) * qtdDe(m) : 0;

  // agrupa por fornecedor (mantém ordem de chegada, que já vem ordenada)
  const grupos: { forn: string; itens: CompraSugestao[] }[] = [];
  for (const m of itens) {
    const forn = m.fornecedor_nome || "Sem fornecedor";
    let g = grupos.find((x) => x.forn === forn);
    if (!g) { g = { forn, itens: [] }; grupos.push(g); }
    g.itens.push(m);
  }
  const totalGeral = itens.reduce((s, m) => s + custoItem(m), 0);

  // Monta a ordem do grupo com o que está marcado e a quantidade editada.
  function gerar(g: { forn: string; itens: CompraSugestao[] }, autoPrint: boolean) {
    const escolhidos = g.itens.filter(incluido).map((m) => ({ ...m, faltam: qtdDe(m) })).filter((m) => m.faltam > 0);
    if (!escolhidos.length) { alert("Marque ao menos um item (com quantidade maior que zero)."); return; }
    const fid = g.itens[0]?.fornecedor_id;
    const f = fid ? fornecedores.find((x) => x.id === fid) || null : null;
    imprimirOrdemCompra(getEmpresa(), f, g.forn, escolhidos, autoPrint);
  }

  if (carregou && itens.length === 0)
    return <div className="card pad empty">Nenhum material abaixo do estoque mínimo. Tudo em dia. ✅</div>;

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Compras sugeridas</h2>
        <span className="muted" style={{ fontSize: 12 }}>Edite as quantidades e marque o que comprar.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} title="Editar os dados que aparecem no cabeçalho da ordem" onClick={() => setEmpresaModal(true)}>✎ Nossos dados</button>
        <span className="muted">Estimativa total: <strong>{rBR(totalGeral)}</strong></span>
      </div>
      {grupos.map((g) => {
        const total = g.itens.reduce((s, m) => s + custoItem(m), 0);
        const nSel = g.itens.filter(incluido).length;
        return (
          <div className="card" key={g.forn} style={{ marginBottom: 14 }}>
            <div className="row-gap" style={{ alignItems: "center", gap: 10, padding: "10px 12px", flexWrap: "wrap" }}>
              <span className="chip chip-kit">🚛 {g.forn}</span>
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{nSel}/{g.itens.length} item(ns) · {rBR(total)}</span>
              <button className="btn btn-soft" title="Abrir sem imprimir (visualizar/editar)" onClick={() => gerar(g, false)}>👁 Visualizar</button>
              <button className="btn btn-primary" title="Gerar e imprimir a ordem de compra" onClick={() => gerar(g, true)}>🧾 Ordem de compra</button>
            </div>
            <table className="table">
              <thead><tr><th style={{ width: 30 }}></th><th>Material</th><th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Comprar</th><th className="num">Custo est.</th></tr></thead>
              <tbody>
                {g.itens.map((m) => {
                  const on = incluido(m);
                  return (
                    <tr key={m.id} style={on ? undefined : { opacity: 0.5 }}>
                      <td><input type="checkbox" checked={on} onChange={() => toggle(m.id)} /></td>
                      <td className="strong">{m.nome}{m.tamanho ? ` · ${m.tamanho}` : ""}{m.cor ? ` · ${m.cor}` : ""}</td>
                      <td className="num"><span className="mat-saldo-baixo">{nBR(m.saldo || 0)} {m.unidade || ""}</span></td>
                      <td className="num">{nBR(m.minimo || 0)}</td>
                      <td className="num">
                        <input value={qtd[m.id] ?? String(m.faltam ?? 0)} onChange={(e) => setQtd((q) => ({ ...q, [m.id]: e.target.value }))}
                          inputMode="decimal" disabled={!on} style={{ width: 64, textAlign: "right" }} /> <span className="muted" style={{ fontSize: 11 }}>{m.unidade || ""}</span>
                      </td>
                      <td className="num">{m.preco != null ? rBR(custoItem(m)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {empresaModal && <EmpresaModal onFechar={() => setEmpresaModal(false)} />}
    </>
  );
}

// ═══════════════════════════ Aba FORNECEDORES ═══════════════════════════
function AbaFornecedores() {
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ f: Partial<Fornecedor> } | null>(null);
  const [colar, setColar] = useState(false);

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
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => setColar(true)}>📋 Colar em massa</button>
        <button className="btn btn-primary" onClick={() => setModal({ f: { nome: "", ativo: 1 } })}>＋ Novo fornecedor</button>
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
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="icon-btn" title="Duplicar" onClick={(e) => { e.stopPropagation(); setModal({ f: { ...f, id: undefined, nome: (f.nome || "") + " (cópia)" } }); }}>⧉</button>
                  <button className="icon-btn" title="Excluir" onClick={(e) => { e.stopPropagation(); remover(f); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <FornecedorModal fornecedor={modal.f} onFechar={() => setModal(null)} onSalvo={() => { setModal(null); recarregar(); }} />}
      {colar && <ColarEmMassa
        titulo="Colar fornecedores em massa"
        colunas="nome · contato · telefone · e-mail"
        exemplo="Coats;João;(11) 99999-0000;joao@coats.com"
        onColar={api.bulkFornecedores}
        onUndo={(ids) => Promise.all(ids.map((id) => api.excluirFornecedor(id))).then(() => {})}
        onFechar={() => setColar(false)}
        onSalvo={recarregar}
      />}
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
      await api.salvarFornecedor({ ...f, nome: capFirst(f.nome || "") });
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
            <Campo label="Nome *"><input value={f.nome || ""} onChange={(e) => set({ nome: e.target.value })} placeholder="ex.: Fios do Sul" spellCheck lang="pt-BR" /></Campo>
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
  const [colar, setColar] = useState(false);

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
      await api.salvarOperador({ nome: capFirst(nome), senha: senha.trim(), setor: setor || undefined });
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
        <div className="row-gap" style={{ alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Novo operador</h2>
          <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => setColar(true)}>📋 Colar em massa</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Ao iniciar uma produção, a pessoa seleciona o nome e digita a senha. Deixe o setor em branco
          para liberar em todos os setores.
        </p>
        <div className="row-gap" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <input placeholder="Nome do operador" value={nome} onChange={(e) => setNome(e.target.value)} spellCheck lang="pt-BR" style={{ minWidth: 200 }} />
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
                <button className="icon-btn" title="Duplicar" onClick={() => { setNome(o.nome + " (cópia)"); setSetor(o.setor || ""); setSenha(""); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }}>⧉</button>
                <button className="icon-btn" title="Remover" onClick={() => remover(o.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {colar && <ColarEmMassa
        titulo="Colar operadores em massa"
        colunas="nome · senha · setor"
        exemplo="Maria;1234;costura"
        onColar={api.bulkOperadores}
        onUndo={(ids) => Promise.all(ids.map((id) => api.removerOperador(id))).then(() => {})}
        onFechar={() => setColar(false)}
        onSalvo={recarregar}
      />}
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
