import { useEffect, useState } from "react";
import { api, type Tassel, type Prestador, type Costura, type RomaneioPedido, type RomaneioData, type EmitidoRomaneio } from "../api";
import { historico } from "../historico";

const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
// Famílias de peças que um serviço de costura pode cobrar.
const AGRUP: { id: string; label: string }[] = [
  { id: "peseira_manta", label: "Peseiras / Mantas" },
  { id: "almofada_capa", label: "Almofadas / Capas" },
  { id: "todas", label: "Todas as peças" },
];
const agrupLabel = (id?: string) => AGRUP.find((a) => a.id === id)?.label || "Todas as peças";

type AbaRomaneio = "costureiras" | "tassel" | "avulso" | "gerados" | "relatorios" | "tasseis" | "costura" | "prestadores";
export function Romaneios() {
  // Mantém a aba ao atualizar a página (não volta para a primeira).
  const [aba, setAba] = useState<AbaRomaneio>(() => (localStorage.getItem("romaneios-aba") as AbaRomaneio) || "costureiras");
  useEffect(() => {
    localStorage.setItem("romaneios-aba", aba);
  }, [aba]);
  const abas: { id: AbaRomaneio; label: string }[] = [
    { id: "costureiras", label: "🪡 Romaneio Costureiras" },
    { id: "tassel", label: "🧶 Romaneio Tassel" },
    { id: "avulso", label: "➕ Romaneio Avulso" },
    { id: "gerados", label: "📃 Romaneios Gerados" },
    { id: "relatorios", label: "📊 Pagamentos" },
    { id: "costura", label: "⚙️ Serviços Costura" },
    { id: "tasseis", label: "⚙️ Valores Tassel" },
    { id: "prestadores", label: "👷 Prestadores" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Romaneios</h1>
          <div className="breadcrumb">Prestadores de serviço › {abas.find((a) => a.id === aba)?.label}</div>
        </div>
        <div className="segmented">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={"seg" + (aba === a.id ? " seg-on" : "")}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "costureiras" && <RomaneiosPedidos tipo="costura" />}
      {aba === "tassel" && <RomaneiosPedidos tipo="tassel" />}
      {aba === "avulso" && <RomaneioAvulso />}
      {aba === "gerados" && <RomaneiosGerados />}
      {aba === "tasseis" && <TasseisCadastro />}
      {aba === "costura" && <CosturaCadastro />}
      {aba === "prestadores" && <PrestadoresCadastro />}
      {aba === "relatorios" && <RelatoriosPagamento />}
    </>
  );
}

// ── Lista de pedidos de produção (Costureiras OU Tassel) ─────────────────────
function RomaneiosPedidos({ tipo }: { tipo: "costura" | "tassel" }) {
  const [itens, setItens] = useState<RomaneioPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<RomaneioPedido | null>(null);

  useEffect(() => {
    api.listarRomaneiosPedidos().then(setItens).catch(() => {}).finally(() => setCarregando(false));
  }, []);

  const q = busca.trim().toLowerCase();
  const base = tipo === "tassel" ? itens.filter((p) => p.temTassel) : itens;
  const lista = q
    ? base.filter((p) => p.numero.toLowerCase().includes(q) || (p.cliente_nome || "").toLowerCase().includes(q))
    : base;

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        {tipo === "tassel"
          ? "Pedidos com tassel a confeccionar. Clique para gerar o romaneio de tassel (3 vias) → prestador de tassel."
          : "Pedidos que vão para produção. Clique para gerar o romaneio de costura (2 vias) → costureira."}
      </p>
      <div className="row-gap" style={{ marginBottom: 12 }}>
        <input className="busca-ped" placeholder="🔎 Pedido, OP ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Pedido / OP</th>
              <th>Cliente</th>
              <th>Entrega</th>
              {tipo === "tassel" ? <th className="num">Tasseis</th> : <th className="num">Peças</th>}
              <th className="num">Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={6} className="empty pad">Carregando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={6} className="empty pad">{tipo === "tassel" ? "Nenhum pedido com tassel." : "Nenhum pedido de produção."}</td></tr>
            ) : (
              lista.map((p) => (
                <tr key={p.pedido_id} style={{ cursor: "pointer" }} onClick={() => setAberto(p)}>
                  <td className="strong">
                    {p.numero} {p.reposicao && <span className="chip" style={{ marginLeft: 6 }}>reposição</span>}
                  </td>
                  <td>{p.cliente_nome}</td>
                  <td>{br(p.data_entrega)}</td>
                  <td className="num strong">{tipo === "tassel" ? p.tasselTasseis ?? 0 : p.totalPecas}</td>
                  <td className="num">{brl(tipo === "tassel" ? p.tasselValor ?? 0 : 0)}</td>
                  <td><button className="btn btn-soft" onClick={(e) => { e.stopPropagation(); setAberto(p); }}>Abrir romaneio</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {aberto && <RomaneioModal pedido={aberto} tipo={tipo} onFechar={() => setAberto(null)} />}
    </>
  );
}

// Modal de UM romaneio (costura OU tassel) — tabela + campos + gerar PDF.
function RomaneioModal({ pedido, tipo, onFechar }: { pedido: RomaneioPedido; tipo: "costura" | "tassel"; onFechar: () => void }) {
  const [data, setData] = useState<RomaneioData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [pessoa, setPessoa] = useState("");
  const [volumes, setVolumes] = useState("");
  const [dataRetorno, setDataRetorno] = useState("");
  const [gerando, setGerando] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api.obterRomaneio(pedido.pedido_id).then(setData).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false));
    api.listarPrestadores().then((l) => {
      const servico = tipo === "tassel" ? "tassel" : "costura";
      setPessoas(l.filter((x) => (x.servico || "") === servico).map((x) => x.nome));
    }).catch(() => {});
  }, [pedido.pedido_id, tipo]);

  // registrar=false → só visualiza; registrar=true → "Gerar" (marca como gerado/pendente).
  async function gerar(registrar: boolean) {
    setErro(""); setOk(""); setGerando(registrar ? "gerar" : "ver");
    try {
      const opts = { prestador: pessoa, volumes, dataRetorno, registrar };
      const r = tipo === "tassel"
        ? await api.gerarRomaneioTassel(pedido.pedido_id, opts)
        : await api.gerarRomaneioCostura(pedido.pedido_id, opts);
      window.open(r.url, "_blank");
      if (registrar) setOk("✓ Romaneio gerado e salvo na base (pendente até retornar).");
    } catch (e) { setErro((e as Error).message); } finally { setGerando(""); }
  }

  const temServicos = !!data?.servicos.length;
  const ehTassel = tipo === "tassel";

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card rom-grande" onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + (ehTassel ? "unica" : "kit")}>
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">ROMANEIO Nº {pedido.numero}</span>
              <span className="modal-pill">{ehTassel ? "🧶 Tassel" : "🪡 Costura"}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{pedido.cliente_nome}</span>
            <span className="kstatus fazendo">entrega {br(pedido.data_entrega)}</span>
          </div>
        </div>

        <div className="modal-bd">
          {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
          {ok && <div style={{ color: "#047857", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{ok}</div>}
          <div className="rom-campos">
            <label>
              <span>{ehTassel ? "PRESTADOR DE TASSEL" : "COSTUREIRA"}</span>
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
                <option value="">— escolher —</option>
                {pessoas.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              <span>DATA RETORNO (devolução)</span>
              <input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} />
            </label>
            <label>
              <span>VOLUMES</span>
              <input type="number" min={0} placeholder="ex.: 2" value={volumes} onChange={(e) => setVolumes(e.target.value)} />
            </label>
          </div>

          {carregando || !data ? (
            <div className="muted">Carregando…</div>
          ) : ehTassel ? (
            !data.tassel ? (
              <p className="muted">Este pedido não tem tassel a confeccionar.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Cor</th><th>Tam</th><th className="num">Tasseis</th><th className="num">Vl Unit.</th><th className="num">Vl Total</th></tr>
                </thead>
                <tbody>
                  {data.tassel.linhas.map((l) => (
                    <tr key={l.cor + l.tamanho}>
                      <td className="strong">{l.cor || "—"}</td>
                      <td>{l.tamanho}</td>
                      <td className="num strong">{l.tasseis}</td>
                      <td className="num">{l.valorUnit ? brl(l.valorUnit) : "—"}</td>
                      <td className="num strong">{l.total ? brl(l.total) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="rom-total">
                    <td className="strong" colSpan={2}>TOTAL</td>
                    <td className="num strong">{data.tassel.totalTasseis}</td>
                    <td></td>
                    <td className="num strong">{brl(data.tassel.totalValor)}</td>
                  </tr>
                </tbody>
              </table>
            )
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr><th>Serviço</th><th className="num">Qtd</th><th className="num">Vl Unit.</th><th className="num">Vl Total</th></tr>
                </thead>
                <tbody>
                  {temServicos ? (
                    data.servicos.map((s) => (
                      <tr key={s.nome}>
                        <td className="strong">{s.nome} <span className="muted" style={{ fontWeight: 400 }}>· {agrupLabel(s.agrupamento)}</span></td>
                        <td className="num strong">{s.qtd}</td>
                        <td className="num">{brl(s.valorUnit)}</td>
                        <td className="num strong">{brl(s.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr><td className="strong">Peseiras / Mantas</td><td className="num strong">{data.peseirasMantas}</td><td className="num muted">—</td><td className="num muted">—</td></tr>
                      <tr><td className="strong">Almofadas / Capas</td><td className="num strong">{data.almofadasCapas}</td><td className="num muted">—</td><td className="num muted">—</td></tr>
                    </>
                  )}
                  <tr className="rom-total">
                    <td className="strong">TOTAL GERAL</td>
                    <td className="num strong">{data.totalPecas} pç</td>
                    <td></td>
                    <td className="num strong">{temServicos ? brl(data.totalValor) : "—"}</td>
                  </tr>
                </tbody>
              </table>
              {!temServicos && (
                <p className="muted" style={{ fontSize: 12 }}>
                  💡 Cadastre os serviços com valor na aba <strong>Serviços Costura</strong> (com o agrupamento) para os valores saírem pré-fixados.
                </p>
              )}
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Fechar</button>
          <div className="row-gap">
            <button className="btn" disabled={!!gerando} onClick={() => gerar(false)}>
              {gerando === "ver" ? "Abrindo…" : "👁 Visualizar PDF"}
            </button>
            <button className={"kbtn " + (ehTassel ? "tecer" : "final")} disabled={!!gerando} onClick={() => gerar(true)}>
              {gerando === "gerar" ? "Gerando…" : "✓ Gerar romaneio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Romaneio AVULSO (produtos que não passam pela produção) ──────────────────
function RomaneioAvulso() {
  const [tipo, setTipo] = useState<"costura" | "tassel">("costura");
  const [cliente, setCliente] = useState("");
  const [numero, setNumero] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [volumes, setVolumes] = useState("");
  const [dataRetorno, setDataRetorno] = useState("");
  const [costureiras, setCostureiras] = useState<string[]>([]);
  const [tasselistas, setTasselistas] = useState<string[]>([]);
  const [servicos, setServicos] = useState<Costura[]>([]);
  // linhas: costura {nome, qtd}; tassel {cor, tamanho, qtd}
  const [linhas, setLinhas] = useState<{ nome?: string; cor?: string; tamanho?: string; qtd: number }[]>([{ qtd: 0 }]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarPrestadores().then((l) => {
      setCostureiras(l.filter((x) => (x.servico || "") === "costura").map((x) => x.nome));
      setTasselistas(l.filter((x) => (x.servico || "") === "tassel").map((x) => x.nome));
    }).catch(() => {});
    api.listarCostura().then(setServicos).catch(() => {});
  }, []);

  const valorDe = (nome?: string) => servicos.find((s) => s.nome === nome)?.valor || 0;
  const setLinha = (i: number, patch: Partial<{ nome: string; cor: string; tamanho: string; qtd: number }>) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => [...ls, { qtd: 0, tamanho: "G" }]);
  const delLinha = (i: number) => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const totalValor = linhas.reduce((s, l) => s + (tipo === "costura" ? valorDe(l.nome) * (Number(l.qtd) || 0) : 0), 0);
  const pessoas = tipo === "tassel" ? tasselistas : costureiras;

  async function gerar() {
    setErro("");
    const validas = linhas.filter((l) => Number(l.qtd) > 0 && (tipo === "tassel" ? (l.cor || "").trim() : (l.nome || "").trim()));
    if (!validas.length) return setErro("Adicione pelo menos uma linha com serviço/cor e quantidade.");
    setGerando(true);
    try {
      const r = await api.gerarRomaneioAvulso({ tipo, cliente, numero, prestador: pessoa, volumes, dataRetorno, linhas: validas });
      window.open(r.url, "_blank");
    } catch (e) { setErro((e as Error).message); } finally { setGerando(false); }
  }

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Romaneio <strong>avulso</strong> — para produtos que <strong>não passam pela produção</strong>. Informe as linhas
        manualmente; os <strong>valores são pré-fixados</strong> do cadastro. Fica salvo p/ o pagamento.
      </p>
      <div className="card pad">
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button className={"seg" + (tipo === "costura" ? " seg-on" : "")} onClick={() => setTipo("costura")}>🪡 Costura</button>
          <button className={"seg" + (tipo === "tassel" ? " seg-on" : "")} onClick={() => setTipo("tassel")}>🧶 Tassel</button>
        </div>

        <div className="rom-campos">
          <label><span>CLIENTE</span><input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" /></label>
          <label><span>Nº ROMANEIO</span><input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ex.: AVULSO-01" /></label>
          <label>
            <span>{tipo === "tassel" ? "PRESTADOR DE TASSEL" : "COSTUREIRA"}</span>
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">— escolher —</option>
              {pessoas.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label><span>DATA RETORNO</span><input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} /></label>
          <label><span>VOLUMES</span><input type="number" min={0} value={volumes} onChange={(e) => setVolumes(e.target.value)} placeholder="ex.: 2" /></label>
        </div>

        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            {tipo === "tassel" ? (
              <tr><th>Cor</th><th>Tam</th><th className="num">Tasseis</th><th></th></tr>
            ) : (
              <tr><th>Serviço</th><th className="num">Qtd</th><th className="num">Vl Unit.</th><th className="num">Vl Total</th><th></th></tr>
            )}
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {tipo === "tassel" ? (
                  <>
                    <td><input value={l.cor || ""} onChange={(e) => setLinha(i, { cor: e.target.value })} placeholder="Cor (ex.: AREIA)" /></td>
                    <td>
                      <select value={l.tamanho || "G"} onChange={(e) => setLinha(i, { tamanho: e.target.value })}>
                        <option value="G">G (peseira)</option>
                        <option value="P">P (almofada)</option>
                      </select>
                    </td>
                    <td className="num"><input className="w-sm num" type="number" min={0} value={l.qtd || ""} onChange={(e) => setLinha(i, { qtd: Number(e.target.value) })} /></td>
                  </>
                ) : (
                  <>
                    <td>
                      <select value={l.nome || ""} onChange={(e) => setLinha(i, { nome: e.target.value })}>
                        <option value="">— serviço —</option>
                        {servicos.map((s) => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="w-sm num" type="number" min={0} value={l.qtd || ""} onChange={(e) => setLinha(i, { qtd: Number(e.target.value) })} /></td>
                    <td className="num">{brl(valorDe(l.nome))}</td>
                    <td className="num strong">{brl(valorDe(l.nome) * (Number(l.qtd) || 0))}</td>
                  </>
                )}
                <td><button className="icon-btn" title="Remover" onClick={() => delLinha(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-soft" style={{ marginTop: 8 }} onClick={addLinha}>＋ Adicionar linha</button>

        {tipo === "costura" && <div style={{ marginTop: 12, textAlign: "right", fontSize: 15 }}>Total: <strong style={{ color: "#1d4ed8" }}>{brl(totalValor)}</strong></div>}
        {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{erro}</div>}
        <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="kbtn final" disabled={gerando} onClick={gerar}>
            {gerando ? "Gerando…" : `👁 Gerar romaneio avulso (${tipo === "tassel" ? "3 vias" : "2 vias"})`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Todos os romaneios gerados (status, retorno, editar, excluir + undo) ─────
const pdfUrl = (e: EmitidoRomaneio) => `/api/pedidos/${e.pedido_id}/pdf/${e.tipo === "tassel" ? "romaneio-tassel" : "romaneio-costura"}`;

function RomaneiosGerados() {
  const [itens, setItens] = useState<EmitidoRomaneio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [fTipo, setFTipo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState<EmitidoRomaneio | null>(null);

  function recarregar() {
    api.listarEmitidos({ tipo: fTipo, status: fStatus }).then(setItens).catch(() => {}).finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTipo, fStatus]);
  // Recarrega ao desfazer/refazer (undo global).
  useEffect(() => {
    const h = () => recarregar();
    window.addEventListener("historico:mudou", h);
    return () => window.removeEventListener("historico:mudou", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTipo, fStatus]);

  async function marcarRetorno(e: EmitidoRomaneio, retornou: boolean) {
    await api.marcarRetornoRomaneio(e.tipo, e.pedido_id, retornou).catch(() => {});
    historico.registrar({
      label: retornou ? `marcar retorno ${e.numero}` : `desmarcar retorno ${e.numero}`,
      desfazer: () => api.marcarRetornoRomaneio(e.tipo, e.pedido_id, !retornou),
      refazer: () => api.marcarRetornoRomaneio(e.tipo, e.pedido_id, retornou),
    });
    recarregar();
  }
  async function excluir(e: EmitidoRomaneio) {
    if (!confirm(`Excluir o romaneio Nº ${e.numero}? (dá para desfazer)`)) return;
    await api.excluirEmitido(e.tipo, e.pedido_id, true).catch(() => {});
    historico.registrar({
      label: `excluir romaneio ${e.numero}`,
      desfazer: () => api.excluirEmitido(e.tipo, e.pedido_id, false),
      refazer: () => api.excluirEmitido(e.tipo, e.pedido_id, true),
    });
    recarregar();
  }

  const q = busca.trim().toLowerCase();
  const lista = q
    ? itens.filter((e) => e.numero.toLowerCase().includes(q) || (e.cliente || "").toLowerCase().includes(q) || (e.pessoa || "").toLowerCase().includes(q))
    : itens;

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Todos os romaneios <strong>gerados</strong>. Marque o <strong>retorno</strong> quando voltar da costura/prestador.
        Os que ainda não voltaram ficam <strong>pendentes</strong>. Editar/excluir com <strong>desfazer</strong> (Ctrl+Z).
      </p>
      <div className="row-gap" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="segmented">
          <button className={"seg" + (fTipo === "" ? " seg-on" : "")} onClick={() => setFTipo("")}>Todos</button>
          <button className={"seg" + (fTipo === "costura" ? " seg-on" : "")} onClick={() => setFTipo("costura")}>🪡 Costura</button>
          <button className={"seg" + (fTipo === "tassel" ? " seg-on" : "")} onClick={() => setFTipo("tassel")}>🧶 Tassel</button>
        </div>
        <div className="segmented">
          <button className={"seg" + (fStatus === "" ? " seg-on" : "")} onClick={() => setFStatus("")}>Todos status</button>
          <button className={"seg" + (fStatus === "pendente" ? " seg-on" : "")} onClick={() => setFStatus("pendente")}>⏳ Pendentes</button>
          <button className={"seg" + (fStatus === "retornou" ? " seg-on" : "")} onClick={() => setFStatus("retornou")}>✓ Retornaram</button>
        </div>
        <input className="busca-ped" placeholder="🔎 Nº, cliente ou prestador…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nº</th><th>Tipo</th><th>Cliente</th><th>Costureira/Prestador</th>
              <th>Saída</th><th>Retorno prev.</th><th>Status</th><th className="num">Valor</th><th></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={9} className="empty pad">Carregando…</td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={9} className="empty pad">Nenhum romaneio gerado.</td></tr>
            ) : (
              lista.map((e) => (
                <tr key={e.tipo + e.pedido_id}>
                  <td className="strong">{e.numero}</td>
                  <td><span className="chip">{e.tipo === "tassel" ? "🧶 Tassel" : "🪡 Costura"}</span></td>
                  <td>{e.cliente || "—"}</td>
                  <td>{e.pessoa || "—"}</td>
                  <td>{br(e.data_saida)}</td>
                  <td>{br(e.data_retorno)}</td>
                  <td>
                    {e.retornou
                      ? <span className="chip" style={{ background: "#dcfce7", color: "#15803d" }}>✓ Retornou {e.data_retorno_real ? `(${br(e.data_retorno_real)})` : ""}</span>
                      : <span className="chip" style={{ background: "#fef3c7", color: "#b45309" }}>⏳ Pendente</span>}
                  </td>
                  <td className="num strong">{brl(e.total_valor)}</td>
                  <td>
                    <div className="row-gap" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="icon-btn" title="Ver PDF" onClick={() => window.open(pdfUrl(e), "_blank")}>👁</button>
                      {e.retornou
                        ? <button className="icon-btn" title="Desmarcar retorno" onClick={() => marcarRetorno(e, false)}>↩</button>
                        : <button className="btn btn-soft" title="Marcar como retornado" onClick={() => marcarRetorno(e, true)}>✓ Voltou</button>}
                      <button className="icon-btn" title="Editar" onClick={() => setEditar(e)}>✎</button>
                      <button className="icon-btn" title="Excluir" onClick={() => excluir(e)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editar && <EditarEmitidoModal emitido={editar} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); recarregar(); }} />}
    </>
  );
}

function EditarEmitidoModal({ emitido, onFechar, onSalvo }: { emitido: EmitidoRomaneio; onFechar: () => void; onSalvo: () => void }) {
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [pessoa, setPessoa] = useState(emitido.pessoa || "");
  const [volumes, setVolumes] = useState(emitido.volumes || "");
  const [dataRetorno, setDataRetorno] = useState(emitido.data_retorno || "");
  const [salvando, setSalvando] = useState(false);
  const ehTassel = emitido.tipo === "tassel";

  useEffect(() => {
    api.listarPrestadores().then((l) => setPessoas(l.filter((x) => (x.servico || "") === (ehTassel ? "tassel" : "costura")).map((x) => x.nome))).catch(() => {});
  }, [ehTassel]);

  async function salvar() {
    setSalvando(true);
    try {
      await api.editarEmitido(emitido.tipo, emitido.pedido_id, { prestador: pessoa, volumes, dataRetorno });
      onSalvo();
    } finally { setSalvando(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + (ehTassel ? "unica" : "kit")}>
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">Nº {emitido.numero}</span><span className="modal-pill">editar</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row"><span className="modal-cli">{emitido.cliente || "—"}</span></div>
        </div>
        <div className="modal-bd">
          <div className="rom-campos">
            <label>
              <span>{ehTassel ? "PRESTADOR DE TASSEL" : "COSTUREIRA"}</span>
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
                <option value="">— escolher —</option>
                {pessoas.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label><span>DATA RETORNO</span><input type="date" value={dataRetorno} onChange={(e) => setDataRetorno(e.target.value)} /></label>
            <label><span>VOLUMES</span><input type="number" min={0} value={volumes} onChange={(e) => setVolumes(e.target.value)} /></label>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>O PDF é regerado com os novos dados (mantém os itens/valores do romaneio).</p>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn final" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar e regerar PDF"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Relatório de pagamento por costureira (fim do mês) ───────────────────────
function RelatoriosPagamento() {
  const [data, setData] = useState<import("../api").PagamentoData | null>(null);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [tipo, setTipo] = useState<"costura" | "tassel">("costura");
  const [costureira, setCostureira] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    api.pagamentoCostura(mes, tipo, costureira).then(setData).catch(() => {}).finally(() => setCarregando(false));
  }, [mes, tipo, costureira]);
  useEffect(() => {
    setCostureira("");
    api.listarPrestadores()
      .then((l) => setPessoas(l.filter((x) => (x.servico || "") === (tipo === "tassel" ? "tassel" : "costura")).map((x) => x.nome)))
      .catch(() => {});
  }, [tipo]);

  const abrirRelatorio = () => window.open(api.relatorioPagamentoUrl(mes, tipo, costureira), "_blank");

  const mesLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const nomes = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mm)] || mm} / ${y}`;
  };

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Pagamento no fim do mês — soma os romaneios emitidos (saída no mês), por prestador.
      </p>
      <div className="row-gap" style={{ marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="segmented">
          <button className={"seg" + (tipo === "costura" ? " seg-on" : "")} onClick={() => setTipo("costura")}>🪡 Costureiras</button>
          <button className={"seg" + (tipo === "tassel" ? " seg-on" : "")} onClick={() => setTipo("tassel")}>🧶 Tassel</button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#94a3b8" }}>MÊS (data de saída)</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#94a3b8" }}>{tipo === "tassel" ? "PRESTADOR" : "COSTUREIRA"}</span>
          <select value={costureira} onChange={(e) => setCostureira(e.target.value)}>
            <option value="">Todas</option>
            {pessoas.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="kbtn final" onClick={abrirRelatorio}>📄 Gerar / baixar PDF</button>
        {data && <div className="muted" style={{ marginLeft: "auto", fontSize: 14 }}>Total: <strong style={{ color: "#1d4ed8" }}>{brl(data.totalGeral)}</strong></div>}
      </div>

      {carregando || !data ? (
        <div className="card pad">Carregando…</div>
      ) : data.grupos.length === 0 ? (
        <div className="card pad muted">Nenhum romaneio emitido em {mesLabel(mes)}.</div>
      ) : (
        data.grupos.map((g) => (
          <div className="card" key={g.costureira} style={{ marginBottom: 14 }}>
            <div className="card-head" style={{ paddingBottom: 12 }}>
              <h2 style={{ margin: 0 }}>👩‍🔧 {g.costureira}</h2>
              <span className="chip" style={{ fontSize: 14, fontWeight: 800 }}>
                a pagar: {g.totalPecas} {tipo === "tassel" ? "tasseis" : "pç"} · {brl(g.totalValor)}
                {g.pendentes ? <span style={{ color: "#94a3b8" }}> · {g.pendentes} pendente(s) {brl(g.pendenteValor || 0)} (não conta)</span> : null}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Romaneio / Pedido</th><th>Saída</th><th>Retorno previsto</th><th>Status</th><th className="num">{tipo === "tassel" ? "Tasseis" : "Peças"}</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {g.romaneios.map((r) => (
                  <tr key={r.pedido_id} style={r.retornou ? undefined : { opacity: 0.45 }}>
                    <td className="strong">Nº {r.numero}</td>
                    <td>{br(r.data_saida)}</td>
                    <td>{br(r.data_retorno)}</td>
                    <td>{r.retornou
                      ? <span className="chip" style={{ background: "#dcfce7", color: "#15803d" }}>✓ Liberado</span>
                      : <span className="chip" style={{ background: "#eef0f4", color: "#94a3b8" }}>⏳ Pendente</span>}</td>
                    <td className="num">{r.total_pecas}</td>
                    <td className="num strong">{brl(r.total_valor)}</td>
                  </tr>
                ))}
                <tr className="rom-total">
                  <td className="strong" colSpan={4}>TOTAL A PAGAR (liberados)</td>
                  <td className="num strong">{g.totalPecas} {tipo === "tassel" ? "tasseis" : "pç"}</td>
                  <td className="num strong">{brl(g.totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}

// ── Tasseis (cor + tamanho + valor da mão de obra) ───────────────────────────
function TasseisCadastro() {
  const [itens, setItens] = useState<Tassel[]>([]);
  const [novo, setNovo] = useState<Tassel>({ cor: "", tamanho: "G", valor: 0 });
  function recarregar() {
    api.listarTasseis().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(t: Tassel) {
    try {
      await api.salvarTassel(t);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.cor.trim()) return;
    await salvar(novo);
    setNovo({ cor: "", tamanho: "G", valor: 0 });
  }
  async function remover(t: Tassel) {
    await api.excluirTassel(t.cor, t.tamanho);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Tassel por <strong>cor</strong> e <strong>tamanho</strong> (G = peseira, P = almofada) e o{" "}
        <strong>valor da mão de obra</strong> por tassel. O romaneio soma tudo automaticamente.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Cor</th>
              <th>Tamanho</th>
              <th className="num">Valor (mão de obra)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Cor (ex.: AREIA)"
                  value={novo.cor}
                  onChange={(e) => setNovo({ ...novo, cor: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <select value={novo.tamanho} onChange={(e) => setNovo({ ...novo, tamanho: e.target.value })}>
                  <option value="G">G (peseira)</option>
                  <option value="P">P (almofada)</option>
                </select>
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((t) => (
              <tr key={t.cor + "|" + t.tamanho}>
                <td className="strong">{t.cor}</td>
                <td>{t.tamanho}</td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={t.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.valor) salvar({ ...t, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(t.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(t)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="empty pad">
                  Nenhum tassel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Costura (serviço + valor) ────────────────────────────────────────────────
function CosturaCadastro() {
  const [itens, setItens] = useState<Costura[]>([]);
  const [novo, setNovo] = useState<Costura>({ nome: "", valor: 0, agrupamento: "todas" });
  function recarregar() {
    api.listarCostura().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(c: Costura) {
    try {
      await api.salvarCostura(c);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", valor: 0, agrupamento: "todas" });
  }
  async function remover(c: Costura) {
    await api.excluirCostura(c.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Serviços de <strong>costura</strong> com <strong>valor pré-fixado</strong>. O{" "}
        <strong>agrupamento</strong> diz qual família cada serviço cobra — o romaneio usa essa qtd × valor.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Serviço de costura</th>
              <th>Agrupamento (cobra qual família)</th>
              <th className="num">Valor unitário</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Ex.: Capas tricô / Etiqueta"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <select value={novo.agrupamento} onChange={(e) => setNovo({ ...novo, agrupamento: e.target.value })}>
                  {AGRUP.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((c) => (
              <tr key={c.nome}>
                <td className="strong">{c.nome}</td>
                <td>
                  <select
                    defaultValue={c.agrupamento || "todas"}
                    onChange={(e) => salvar({ ...c, agrupamento: e.target.value })}
                  >
                    {AGRUP.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={c.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== c.valor) salvar({ ...c, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(c.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(c)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="empty pad">
                  Nenhum serviço de costura cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Prestadores de serviço ───────────────────────────────────────────────────
function PrestadoresCadastro() {
  const [itens, setItens] = useState<Prestador[]>([]);
  const [novo, setNovo] = useState<Prestador>({ nome: "", telefone: "", servico: "tassel", obs: "" });
  function recarregar() {
    api.listarPrestadores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(p: Prestador) {
    try {
      await api.salvarPrestador(p);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", telefone: "", servico: "tassel", obs: "" });
  }
  async function remover(p: Prestador) {
    await api.excluirPrestador(p.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Quem faz o serviço (tassel, costura…). Aparecem para escolha ao gerar o romaneio.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Serviço</th>
              <th>Observação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Nome do prestador"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <input
                  placeholder="(00) 00000-0000"
                  value={novo.telefone ?? ""}
                  onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                />
              </td>
              <td>
                <select value={novo.servico ?? ""} onChange={(e) => setNovo({ ...novo, servico: e.target.value })}>
                  <option value="tassel">Tassel</option>
                  <option value="costura">Costura</option>
                  <option value="outro">Outro</option>
                </select>
              </td>
              <td>
                <input
                  placeholder="Observação"
                  value={novo.obs ?? ""}
                  onChange={(e) => setNovo({ ...novo, obs: e.target.value })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((p) => (
              <tr key={p.nome}>
                <td className="strong">{p.nome}</td>
                <td>{p.telefone || "—"}</td>
                <td>
                  <span className="chip">{p.servico || "—"}</span>
                </td>
                <td>{p.obs || "—"}</td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(p)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="empty pad">
                  Nenhum prestador cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
