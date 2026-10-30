import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type Representante, type ComercialVendas, type ComercialDetalhe, type VendaRep, type DiagnosticoCarteira } from "../api";
import { getUser, pode } from "../auth";

type Aba = "visao" | "representantes" | "vendas" | "relatorios" | "automacoes";

const brl = (n: number) =>
  "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nInt = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");
const dataBr = (s?: string | null) => {
  if (!s) return "—";
  const d = s.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
};
const norm = (s?: string | null) => String(s ?? "").trim().toLowerCase();

// Primeiro e último dia do mês corrente (YYYY-MM-DD) — período padrão do dashboard.
function mesCorrente(): { de: string; ate: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const primeiro = `${ano}-${p(mes + 1)}-01`;
  const ultimo = new Date(ano, mes + 1, 0);
  const ate = `${ultimo.getFullYear()}-${p(ultimo.getMonth() + 1)}-${p(ultimo.getDate())}`;
  return { de: primeiro, ate };
}

// Ícones Lucide (inline) — leves e padronizados.
function Ic({ d, size = 16 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}><path d={d} /></svg>;
}
const ICON = {
  visao: "M3 3v18h18M7 14l3-3 3 3 5-6",
  reps: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 0zM22 21v-2a4 4 0 0 0-3-3.87",
  vendas: "M3 3v18h18M19 9l-5 5-4-4-4 4",
  relat: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
  auto: "M13 2 3 14h9l-1 8 10-12h-9z",
  busca: "M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M21 21l-4.3-4.3",
  mais: "M12 5v14M5 12h14",
};

export function Comercial() {
  const u = getUser();
  const verDash = pode(u, "vendas-dashboard");
  const verReps = pode(u, "representantes");
  const abas: { id: Aba; label: string; icon: keyof typeof ICON; ok: boolean }[] = [
    { id: "visao", label: "Visão geral", icon: "visao", ok: verDash },
    { id: "representantes", label: "Representantes", icon: "reps", ok: verReps },
    { id: "vendas", label: "Vendas", icon: "vendas", ok: verDash },
    { id: "relatorios", label: "Relatórios", icon: "relat", ok: verReps },
    { id: "automacoes", label: "Automações", icon: "auto", ok: verReps },
  ];
  const disp = abas.filter((a) => a.ok);
  const abaInicial = (): Aba => {
    const salva = localStorage.getItem("comercial-aba") as Aba | null;
    if (salva && disp.some((a) => a.id === salva)) return salva;
    return disp[0]?.id ?? "visao";
  };
  const [aba, setAba] = useState<Aba>(abaInicial);
  function mudar(a: Aba) { setAba(a); localStorage.setItem("comercial-aba", a); }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comercial</h1>
          <div className="breadcrumb">Central de representantes › {disp.find((a) => a.id === aba)?.label}</div>
        </div>
      </div>

      <div className="com-tabs">
        {disp.map((a) => (
          <button key={a.id} type="button" className={"com-tab" + (aba === a.id ? " on" : "")} onClick={() => mudar(a.id)}>
            <Ic d={ICON[a.icon]} /> <span>{a.label}</span>
          </button>
        ))}
      </div>

      {aba === "visao" && <AbaDashboard />}
      {aba === "representantes" && <AbaRepresentantes />}
      {aba === "vendas" && <AbaVendas />}
      {aba === "relatorios" && <AbaRelatorios />}
      {aba === "automacoes" && <AbaAutomacoes />}
    </>
  );
}

// ── VISÃO GERAL — dashboard de vendas por representante (ranking + drill-down) ────
function AbaDashboard() {
  const inicial = useMemo(mesCorrente, []);
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [dados, setDados] = useState<ComercialVendas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    setCarregando(true); setErro("");
    api.vendasComercial({ de, ate }).then(setDados).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false));
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  const lista = dados?.lista || [];
  const totais = dados?.totais || { pedidos: 0, pecas: 0, valor: 0 };
  const maxValor = lista.reduce((m, g) => Math.max(m, g.valor), 0) || 1;
  const semRep = lista.filter((g) => !g.vendedor || norm(g.vendedor) === "sem vendedor" || norm(g.vendedor) === "").reduce((s, g) => s + g.valor, 0);

  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ComercialDetalhe | null>(null);
  const [carrDet, setCarrDet] = useState(false);
  function abrirDetalhe(vendedor: string) {
    if (aberto === vendedor) { setAberto(null); setDetalhe(null); return; }
    setAberto(vendedor); setDetalhe(null); setCarrDet(true);
    api.vendasDetalhe(vendedor, { de, ate }).then(setDetalhe).catch((e) => setErro((e as Error).message)).finally(() => setCarrDet(false));
  }

  return (
    <div className="com-card">
      <div className="com-filtros">
        <label className="campo"><span>De</span><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="campo"><span>Até</span><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "Aplicar"}</button>
      </div>

      {erro && <div className="aviso-erro">{erro}</div>}

      <div className="com-kpis">
        <div className="com-kpi"><div className="k-lbl">Faturamento no mês</div><div className="k-val">{brl(totais.valor)}</div></div>
        <div className="com-kpi"><div className="k-lbl">Pedidos</div><div className="k-val">{nInt(totais.pedidos)}</div></div>
        <div className="com-kpi"><div className="k-lbl">Representantes com venda</div><div className="k-val">{nInt(lista.length)}</div></div>
        <div className="com-kpi"><div className="k-lbl">Vendas sem representante</div><div className="k-val" style={{ color: semRep > 0 ? "#b45309" : undefined }}>{brl(semRep)}</div></div>
      </div>

      {lista.length === 0 ? <p className="muted" style={{ padding: "8px 2px" }}>Nenhuma venda no período.</p> : (
        <table className="table">
          <thead><tr>
            <th>#</th><th>Representante</th>
            <th style={{ textAlign: "right" }}>Pedidos</th><th style={{ textAlign: "right" }}>Peças</th>
            <th style={{ textAlign: "right" }}>Faturamento</th><th style={{ width: "24%" }}>Participação</th>
          </tr></thead>
          <tbody>
            {lista.map((g, i) => (
              <Fragment key={g.vendedor}>
                <tr style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(g.vendedor)} title="Ver os pedidos deste representante">
                  <td>{i + 1}º</td>
                  <td><span style={{ display: "inline-block", width: 14 }}>{aberto === g.vendedor ? "▾" : "▸"}</span> <strong>{g.vendedor || "— sem representante —"}</strong></td>
                  <td style={{ textAlign: "right" }}>{nInt(g.pedidos)}</td>
                  <td style={{ textAlign: "right" }}>{nInt(g.pecas)}</td>
                  <td style={{ textAlign: "right" }}>{brl(g.valor)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: "var(--bg-soft,#eef0f3)", borderRadius: 6, overflow: "hidden", height: 12 }}>
                        <div style={{ width: `${Math.round((g.valor / maxValor) * 100)}%`, height: "100%", background: "#2563eb" }} />
                      </div>
                      <span className="muted" style={{ fontSize: 11.5, minWidth: 34, textAlign: "right" }}>{Math.round((g.valor / (totais.valor || 1)) * 100)}%</span>
                    </div>
                  </td>
                </tr>
                {aberto === g.vendedor && <tr><td colSpan={6} style={{ background: "var(--bg-soft,#fafafa)", padding: 0 }}><DetalheRep detalhe={detalhe} carregando={carrDet} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr>
            <td colSpan={2}><strong>Total</strong></td>
            <td style={{ textAlign: "right" }}><strong>{nInt(totais.pedidos)}</strong></td>
            <td style={{ textAlign: "right" }}><strong>{nInt(totais.pecas)}</strong></td>
            <td style={{ textAlign: "right" }}><strong>{brl(totais.valor)}</strong></td><td></td>
          </tr></tfoot>
        </table>
      )}
    </div>
  );
}

function DetalheRep({ detalhe, carregando }: { detalhe: ComercialDetalhe | null; carregando: boolean }) {
  if (carregando) return <div style={{ padding: 16 }} className="muted">Carregando pedidos…</div>;
  if (!detalhe || detalhe.pedidos.length === 0) return <div style={{ padding: 16 }} className="muted">Sem pedidos no período.</div>;
  return (
    <div style={{ padding: 12 }}>
      <table className="table" style={{ margin: 0 }}>
        <thead><tr>
          <th>Pedido</th><th>Cliente</th><th>Data</th>
          <th style={{ textAlign: "right" }}>Qtd</th><th style={{ textAlign: "right" }}>Valor</th><th style={{ textAlign: "center" }}>Cliente</th>
        </tr></thead>
        <tbody>
          {detalhe.pedidos.map((p) => (
            <tr key={p.id}>
              <td>{p.numero || "—"}</td><td>{p.cliente}</td><td>{dataBr(p.data)}</td>
              <td style={{ textAlign: "right" }}>{nInt(p.pecas)}</td><td style={{ textAlign: "right" }}>{brl(p.valor)}</td>
              <td style={{ textAlign: "center" }}>{p.clienteNovo
                ? <span style={{ background: "#1f9d55", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>NOVO</span>
                : <span className="muted" style={{ fontSize: 12 }}>recorrente</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td colSpan={3}><strong>{detalhe.totais.novos} cliente(s) novo(s)</strong></td>
          <td style={{ textAlign: "right" }}><strong>{nInt(detalhe.totais.pecas)}</strong></td>
          <td style={{ textAlign: "right" }}><strong>{brl(detalhe.totais.valor)}</strong></td><td></td>
        </tr></tfoot>
      </table>
    </div>
  );
}

// ── REPRESENTANTES — listagem profissional + cadastro ────────────────────────────
const VAZIO: Partial<Representante> = { nome: "", whatsapp: "", email: "", observacao: "", ufs: "", cidades: "", comissao: null, instagram: "", ativo: 1 };

function AbaRepresentantes() {
  const [lista, setLista] = useState<Representante[]>([]);
  const [vendasMes, setVendasMes] = useState<Record<string, VendaRep>>({});
  const [carregando, setCarregando] = useState(true);
  const [edit, setEdit] = useState<Partial<Representante> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [fUf, setFUf] = useState("");
  const [fSit, setFSit] = useState<"todos" | "ativo" | "inativo">("ativo");
  const [ordem, setOrdem] = useState<"nome" | "faturamento">("nome");
  const [verId, setVerId] = useState<string | null>(null);
  const [diag, setDiag] = useState(false);

  function carregar() {
    setCarregando(true);
    api.listarRepresentantes().then(setLista).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false));
    const m = mesCorrente();
    api.vendasComercial({ de: m.de, ate: m.ate }).then((d) => {
      const map: Record<string, VendaRep> = {};
      (d.lista || []).forEach((v) => { map[norm(v.vendedor)] = v; });
      setVendasMes(map);
    }).catch(() => {});
  }
  useEffect(carregar, []);

  async function salvar() {
    if (!edit?.nome?.trim()) { setErro("Informe o nome do representante."); return; }
    setSalvando(true); setErro("");
    try { await api.salvarRepresentante(edit); setEdit(null); carregar(); }
    catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function alternarAtivo(r: Representante) { await api.ativarRepresentante(r.id, !(r.ativo ?? 1)); carregar(); }
  async function excluir(r: Representante) {
    if (!confirm(`Excluir o representante "${r.nome}"? As vendas dele continuam no histórico.`)) return;
    await api.excluirRepresentante(r.id); carregar();
  }

  // UFs disponíveis pro filtro.
  const ufsDisp = useMemo(() => {
    const s = new Set<string>();
    lista.forEach((r) => (r.ufs || "").split(/[,;\s]+/).forEach((u) => { const x = u.trim().toUpperCase(); if (/^[A-Z]{2}$/.test(x)) s.add(x); }));
    return [...s].sort();
  }, [lista]);

  const fatDe = (r: Representante) => vendasMes[norm(r.nome)]?.valor || 0;
  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista
      .filter((r) => fSit === "todos" || (fSit === "ativo" ? (r.ativo ?? 1) : !(r.ativo ?? 1)))
      .filter((r) => !fUf || (r.ufs || "").toUpperCase().split(/[,;\s]+/).includes(fUf))
      .filter((r) => !t || [r.nome, r.whatsapp, r.email, r.cidades, r.ufs].some((x) => String(x ?? "").toLowerCase().includes(t)))
      .sort((a, b) => ordem === "faturamento" ? fatDe(b) - fatDe(a) : String(a.nome).localeCompare(String(b.nome)));
    // eslint-disable-next-line
  }, [lista, busca, fUf, fSit, ordem, vendasMes]);

  const totFat = filtrada.reduce((s, r) => s + fatDe(r), 0);

  return (
    <>
      <div className="com-card">
        <div className="com-head">
          <div className="com-filtros" style={{ margin: 0 }}>
            <div className="com-busca"><Ic d={ICON.busca} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, cidade, WhatsApp…" /></div>
            <select className="com-sel" value={fUf} onChange={(e) => setFUf(e.target.value)}><option value="">Todos os estados</option>{ufsDisp.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <select className="com-sel" value={fSit} onChange={(e) => setFSit(e.target.value as "todos" | "ativo" | "inativo")}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="todos">Todos</option></select>
            <select className="com-sel" value={ordem} onChange={(e) => setOrdem(e.target.value as "nome" | "faturamento")}><option value="nome">Ordenar: Nome</option><option value="faturamento">Ordenar: Faturamento</option></select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-soft" onClick={() => setDiag(true)} title="Ver como a carteira está ligada e o que veio do Syntech"><Ic d={ICON.busca} size={15} /> Diagnóstico da carteira</button>
            <button className="btn btn-primary" onClick={() => setEdit({ ...VAZIO })}><Ic d={ICON.mais} size={15} /> Novo representante</button>
          </div>
        </div>

        {erro && <div className="aviso-erro">{erro}</div>}

        {carregando ? <p className="muted">Carregando…</p> : filtrada.length === 0 ? <p className="muted" style={{ padding: "8px 2px" }}>Nenhum representante encontrado.</p> : (
          <table className="table com-tbl">
            <thead><tr>
              <th>Representante</th><th>Estados</th>
              <th style={{ textAlign: "right" }}>Carteira</th><th style={{ textAlign: "right" }}>Comissão</th>
              <th>WhatsApp</th><th style={{ textAlign: "right" }}>Faturamento/mês</th>
              <th style={{ textAlign: "center" }}>Situação</th><th style={{ textAlign: "right" }}>Ações</th>
            </tr></thead>
            <tbody>
              {filtrada.map((r) => {
                const aberto = verId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr style={{ opacity: (r.ativo ?? 1) ? 1 : 0.55 }}>
                      <td><button className="com-link" onClick={() => setVerId(aberto ? null : r.id)} title="Ver cadastro completo"><span style={{ width: 12, display: "inline-block" }}>{aberto ? "▾" : "▸"}</span> <strong>{r.nome}</strong></button></td>
                      <td>{(r.ufs || "").split(/[,;\s]+/).filter(Boolean).slice(0, 4).map((u) => <span key={u} className="com-chip">{u}</span>) || "—"}{!r.ufs && <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "right" }}>{nInt(r.carteira || 0)}</td>
                      <td style={{ textAlign: "right" }}>{r.comissao != null ? `${r.comissao}%` : "—"}</td>
                      <td>{r.whatsapp || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{brl(fatDe(r))}</td>
                      <td style={{ textAlign: "center" }}><span className={"com-badge " + ((r.ativo ?? 1) ? "ok" : "off")}>{(r.ativo ?? 1) ? "Ativo" : "Inativo"}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-soft" onClick={() => setEdit(r)}>Editar</button>{" "}
                        <button className="btn btn-soft" onClick={() => alternarAtivo(r)}>{(r.ativo ?? 1) ? "Desativar" : "Ativar"}</button>{" "}
                        <button className="btn btn-soft" onClick={() => excluir(r)}>Excluir</button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr><td colSpan={8} style={{ background: "var(--bg-soft,#fafafa)" }}>
                        <div className="com-detalhe">
                          <div><b>E-mail:</b> {r.email || "—"}</div>
                          <div><b>Instagram:</b> {r.instagram || "—"}</div>
                          <div style={{ gridColumn: "1 / -1" }}><b>Cidades atendidas:</b> {r.cidades || "— (atende o estado inteiro)"}</div>
                          {r.observacao && <div style={{ gridColumn: "1 / -1" }}><b>Observação:</b> {r.observacao}</div>}
                          <div style={{ gridColumn: "1 / -1", marginTop: 6 }}><button className="btn btn-primary" onClick={() => setEdit(r)}>Abrir cadastro completo</button></div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot><tr>
              <td colSpan={5}><strong>{filtrada.length} representante(s)</strong></td>
              <td style={{ textAlign: "right" }}><strong>{brl(totFat)}</strong></td><td colSpan={2}></td>
            </tr></tfoot>
          </table>
        )}
      </div>

      {edit && <ModalRep edit={edit} setEdit={setEdit} salvar={salvar} salvando={salvando} />}
      {diag && <ModalDiagnostico onFechar={() => setDiag(false)} />}
    </>
  );
}

// Diagnóstico da carteira: cruza representantes cadastrados × carteira real
// (clientes.representante) × vendedores que vêm do Syntech (pedidos.vendedor).
// Só leitura — serve pra ver o que está ligado e o que está "órfão".
function ModalDiagnostico({ onFechar }: { onFechar: () => void }) {
  const [d, setD] = useState<DiagnosticoCarteira | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<"resumo" | "duplicados" | "reps" | "carteira" | "syntech">("resumo");
  const [juntando, setJuntando] = useState("");   // nome de origem em processamento
  const [msg, setMsg] = useState("");

  function recarregar() {
    setCarregando(true);
    api.diagnosticoCarteira()
      .then(setD)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }
  useEffect(recarregar, []);

  // Junta o nome antigo "de" na carteira do representante cadastrado "para".
  async function juntar(de: string, para: string, clientes: number) {
    if (!para) return;
    if (!confirm(`Juntar os ${clientes} cliente(s) de "${de}" na carteira de "${para}"?\n\nOs clientes continuam os mesmos — só o representante passa a ser "${para}".`)) return;
    setJuntando(de); setErro(""); setMsg("");
    try {
      const r = await api.juntarCarteira(de, para);
      if (r.error) { setErro(r.error); return; }
      setMsg(`✅ ${r.movidos} cliente(s) movidos de "${r.de}" para "${r.para}".`);
      recarregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setJuntando(""); }
  }

  const sim = (v: boolean) => v
    ? <span className="com-badge ok">sim</span>
    : <span className="com-badge off">não</span>;

  // Junta um representante DUPLICADO "de" em outro cadastrado "para" (move carteira + apaga o repetido).
  async function juntarRepetido(de: string, para: string, clientes: number) {
    if (!para) return;
    if (!confirm(`Juntar a carteira de "${de}" (${clientes} cliente(s)) em "${para}" e EXCLUIR o cadastro duplicado "${de}"?\n\nOs clientes continuam os mesmos — só passam pro "${para}". As vendas no histórico não se perdem.`)) return;
    setJuntando(de); setErro(""); setMsg("");
    try {
      const r = await api.juntarRep(de, para);
      if (r.error) { setErro(r.error); return; }
      setMsg(`✅ ${r.movidos} cliente(s) movidos para "${r.para}" e o cadastro duplicado "${r.de}" foi removido.`);
      recarregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setJuntando(""); }
  }

  // Seletor "Juntar com [rep] [botão]" pra um nome órfão da carteira (ordem alfabética).
  const nomesReps = (d?.representantes || []).map((r) => r.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  function Juntar({ de, clientes }: { de: string; clientes: number }) {
    const [para, setPara] = useState("");
    const ocupado = juntando === de;
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <select className="com-sel" value={para} onChange={(e) => setPara(e.target.value)} disabled={ocupado} style={{ maxWidth: 180 }}>
          <option value="">Juntar com…</option>
          {nomesReps.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-soft" disabled={!para || ocupado} onClick={() => juntar(de, para, clientes)}>{ocupado ? "…" : "Juntar"}</button>
      </div>
    );
  }

  // Dentro de um grupo de duplicados: junta ESTE rep em um dos OUTROS do grupo.
  function JuntarNoGrupo({ de, clientes, opcoes }: { de: string; clientes: number; opcoes: string[] }) {
    const [para, setPara] = useState(opcoes.length === 1 ? opcoes[0] : "");
    const ocupado = juntando === de;
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select className="com-sel" value={para} onChange={(e) => setPara(e.target.value)} disabled={ocupado} style={{ maxWidth: 220 }}>
          <option value="">Juntar neste…</option>
          {opcoes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-soft" disabled={!para || ocupado} onClick={() => juntarRepetido(de, para, clientes)}>{ocupado ? "…" : "Juntar e apagar"}</button>
      </div>
    );
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: "min(96vw, 820px)" }}>
        <div className="modal-hd"><h3>🔍 Diagnóstico da carteira</h3><button className="modal-x" onClick={onFechar}>×</button></div>
        <div className="modal-bd">
          {carregando ? <p className="muted">Carregando…</p> : erro ? <div className="aviso-erro">{erro}</div> : d && (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                A carteira de cada representante é a lista de clientes cujo campo <b>“representante”</b> bate com o nome
                dele. O <b>Syntech</b> manda o <b>vendedor</b> em cada pedido — por isso cruzamos os três lados pra achar
                nomes duplicados ou que não ligam.
              </p>

              {msg && <div className="aviso-ok" style={{ marginBottom: 10 }}>{msg}</div>}

              <div className="com-filtros" style={{ margin: "0 0 12px" }}>
                <button className={"btn " + (aba === "resumo" ? "btn-primary" : "btn-soft")} onClick={() => setAba("resumo")}>Resumo</button>
                <button className={"btn " + (aba === "duplicados" ? "btn-primary" : "btn-soft")} onClick={() => setAba("duplicados")}>Duplicados{d.repsDuplicados.length ? ` (${d.repsDuplicados.length})` : ""}</button>
                <button className={"btn " + (aba === "reps" ? "btn-primary" : "btn-soft")} onClick={() => setAba("reps")}>Representantes ({d.representantes.length})</button>
                <button className={"btn " + (aba === "carteira" ? "btn-primary" : "btn-soft")} onClick={() => setAba("carteira")}>Carteira ({d.carteira.length})</button>
                <button className={"btn " + (aba === "syntech" ? "btn-primary" : "btn-soft")} onClick={() => setAba("syntech")}>Vendedores Syntech ({d.vendedores.length})</button>
              </div>

              {aba === "resumo" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="com-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <div className="com-kpi"><div className="k-lbl">Clientes no total</div><div className="k-val">{nInt(d.resumo.totalClientes)}</div></div>
                    <div className="com-kpi"><div className="k-lbl">Com representante</div><div className="k-val">{nInt(d.resumo.comRep)}</div></div>
                    <div className="com-kpi"><div className="k-lbl">Sem representante</div><div className="k-val">{nInt(d.resumo.semRep)}</div></div>
                    <div className="com-kpi"><div className="k-lbl">Reps cadastrados</div><div className="k-val">{nInt(d.resumo.representantes)} <small className="muted">({nInt(d.resumo.repsAtivos)} ativos)</small></div></div>
                    <div className="com-kpi"><div className="k-lbl">Nomes na carteira</div><div className="k-val">{nInt(d.resumo.nomesNaCarteira)}</div></div>
                    <div className="com-kpi"><div className="k-lbl">Vendedores do Syntech</div><div className="k-val">{nInt(d.resumo.vendedoresSyntech)}</div></div>
                  </div>

                  <div>
                    <h4 style={{ margin: "4px 0 6px" }}>⚠️ Carteira sem representante cadastrado ({d.orfaos.carteiraSemRep.length})</h4>
                    <p className="muted" style={{ margin: "0 0 6px" }}>Estes clientes têm um nome de representante que <b>não existe</b> no cadastro. Normalmente é um nome antigo/variação — dá pra juntar com o rep certo.</p>
                    {d.orfaos.carteiraSemRep.length === 0 ? <p className="muted">Nenhum — tudo ligado. 🎉</p> : (
                      <table className="table com-tbl"><thead><tr><th>Nome na carteira</th><th style={{ textAlign: "right" }}>Clientes</th><th style={{ textAlign: "right" }}>Do Syntech</th><th style={{ textAlign: "right" }}>Juntar com o rep certo</th></tr></thead>
                        <tbody>{d.orfaos.carteiraSemRep.map((x) => <tr key={x.nome}><td><strong>{x.nome}</strong></td><td style={{ textAlign: "right" }}>{nInt(x.clientes)}</td><td style={{ textAlign: "right" }}>{nInt(x.doSyntech)}</td><td style={{ textAlign: "right" }}><Juntar de={x.nome} clientes={x.clientes} /></td></tr>)}</tbody>
                      </table>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: "4px 0 6px" }}>📭 Representantes sem carteira ({d.orfaos.repsSemCarteira.length})</h4>
                    <p className="muted" style={{ margin: "0 0 6px" }}>Cadastrados, mas sem nenhum cliente ligado. Pode ser duplicata (o nome certo está na lista acima) ou rep novo.</p>
                    {d.orfaos.repsSemCarteira.length === 0 ? <p className="muted">Nenhum.</p> : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {d.orfaos.repsSemCarteira.map((r) => <span key={r.nome} className="com-chip">{r.nome}{!r.ativo && " (inativo)"}</span>)}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: "4px 0 6px" }}>🏭 Vendedores do Syntech sem cadastro ({d.orfaos.vendedoresSemRep.length})</h4>
                    <p className="muted" style={{ margin: "0 0 6px" }}>Nomes que aparecem nos pedidos do Syntech mas que <b>não</b> têm representante cadastrado com esse nome.</p>
                    {d.orfaos.vendedoresSemRep.length === 0 ? <p className="muted">Nenhum.</p> : (
                      <table className="table com-tbl"><thead><tr><th>Vendedor (Syntech)</th><th style={{ textAlign: "right" }}>Pedidos</th><th style={{ textAlign: "center" }}>Vira carteira?</th></tr></thead>
                        <tbody>{d.orfaos.vendedoresSemRep.map((v) => <tr key={v.nome}><td><strong>{v.nome}</strong></td><td style={{ textAlign: "right" }}>{nInt(v.pedidos)}</td><td style={{ textAlign: "center" }}>{sim(v.temCarteira)}</td></tr>)}</tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {aba === "duplicados" && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Cadastros que têm o <b>mesmo primeiro nome</b> — provável a <b>mesma pessoa cadastrada 2×</b>. A etiqueta
                    {" "}<span className="com-badge ok">Syntech</span> marca o nome que vem do ERP. Para deixar <b>só o do Syntech</b>:
                    na linha do <b>outro</b> cadastro, escolha o nome com Syntech e clique <b>Juntar e apagar</b> — a carteira vai
                    pra ele e o WhatsApp/senha do que some é copiado junto (nada se perde). O seletor agora mostra <b>todos</b> os
                    representantes, não só os deste grupo. <b>Confira antes</b> — se forem pessoas diferentes, é só deixar quieto.
                  </p>
                  {d.repsDuplicados.length === 0 ? <p className="muted">Nenhum grupo de nome repetido. 🎉</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {d.repsDuplicados.map((grupo) => (
                        <div key={grupo.chave} className="com-card" style={{ margin: 0, padding: 12 }}>
                          <div style={{ fontWeight: 700, textTransform: "capitalize", marginBottom: 8 }}>{grupo.chave} <small className="muted" style={{ fontWeight: 400 }}>({grupo.reps.length} cadastros)</small></div>
                          <table className="table com-tbl"><thead><tr><th>Cadastro</th><th style={{ textAlign: "right" }}>Carteira</th><th style={{ textAlign: "center" }}>WhatsApp</th><th style={{ textAlign: "center" }}>No Syntech</th><th>Juntar neste outro e apagar este</th></tr></thead>
                            <tbody>{grupo.reps.map((r) => (
                              <tr key={r.nome} style={{ opacity: r.ativo ? 1 : 0.55 }}>
                                <td><strong>{r.nome}</strong> {r.noSyntech && <span className="com-badge ok">Syntech</span>}</td>
                                <td style={{ textAlign: "right" }}>{nInt(r.carteira)}</td>
                                <td style={{ textAlign: "center" }}>{sim(r.temWhatsapp)}</td>
                                <td style={{ textAlign: "center" }}>{sim(r.noSyntech)}</td>
                                <td><JuntarNoGrupo de={r.nome} clientes={r.carteira} opcoes={nomesReps.filter((n) => n !== r.nome)} /></td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {aba === "reps" && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Todos os representantes. A etiqueta <span className="com-badge ok">Syntech</span> marca quem vem do ERP.
                    Use <b>Juntar neste…</b> pra unir qualquer cadastro duplicado em outro (move a carteira, copia o WhatsApp/senha e apaga o repetido).
                  </p>
                  <table className="table com-tbl"><thead><tr><th>Representante</th><th style={{ textAlign: "right" }}>Carteira</th><th style={{ textAlign: "center" }}>WhatsApp</th><th style={{ textAlign: "center" }}>No Syntech</th><th style={{ textAlign: "center" }}>Situação</th><th>Juntar neste outro e apagar este</th></tr></thead>
                  <tbody>{d.representantes.map((r) => (
                    <tr key={r.nome} style={{ opacity: r.ativo ? 1 : 0.55 }}>
                      <td><strong>{r.nome}</strong> {r.noSyntech && <span className="com-badge ok">Syntech</span>}</td>
                      <td style={{ textAlign: "right" }}>{nInt(r.carteira)}</td>
                      <td style={{ textAlign: "center" }}>{sim(r.temWhatsapp)}</td>
                      <td style={{ textAlign: "center" }}>{sim(r.noSyntech)}</td>
                      <td style={{ textAlign: "center" }}><span className={"com-badge " + (r.ativo ? "ok" : "off")}>{r.ativo ? "Ativo" : "Inativo"}</span></td>
                      <td><JuntarNoGrupo de={r.nome} clientes={r.carteira} opcoes={nomesReps.filter((n) => n !== r.nome)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                </>
              )}

              {aba === "carteira" && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>Cada nome distinto que aparece em <b>clientes.representante</b>, com quantos clientes carrega e quantos desses vieram do Syntech (têm código do ERP).</p>
                  <table className="table com-tbl"><thead><tr><th>Nome na carteira</th><th style={{ textAlign: "right" }}>Clientes</th><th style={{ textAlign: "right" }}>Do Syntech</th><th style={{ textAlign: "center" }}>Rep cadastrado?</th></tr></thead>
                    <tbody>{d.carteira.map((x) => (
                      <tr key={x.nome}><td><strong>{x.nome}</strong></td><td style={{ textAlign: "right" }}>{nInt(x.clientes)}</td><td style={{ textAlign: "right" }}>{nInt(x.doSyntech)}</td><td style={{ textAlign: "center" }}>{sim(x.temRep)}</td></tr>
                    ))}</tbody>
                  </table>
                </>
              )}

              {aba === "syntech" && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>Nomes de vendedor que o Syntech manda nos pedidos (já limpos). “Vira carteira?” indica se esse nome é usado em <b>clientes.representante</b>.</p>
                  <table className="table com-tbl"><thead><tr><th>Vendedor (Syntech)</th><th style={{ textAlign: "right" }}>Pedidos</th><th style={{ textAlign: "center" }}>Rep cadastrado?</th><th style={{ textAlign: "center" }}>Vira carteira?</th></tr></thead>
                    <tbody>{d.vendedores.map((v) => (
                      <tr key={v.nome}><td><strong>{v.nome}</strong></td><td style={{ textAlign: "right" }}>{nInt(v.pedidos)}</td><td style={{ textAlign: "center" }}>{sim(v.temRep)}</td><td style={{ textAlign: "center" }}>{sim(v.temCarteira)}</td></tr>
                    ))}</tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalRep({ edit, setEdit, salvar, salvando }: { edit: Partial<Representante>; setEdit: (r: Partial<Representante> | null) => void; salvar: () => void; salvando: boolean }) {
  const set = (p: Partial<Representante>) => setEdit({ ...edit, ...p });
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-hd"><h3>{edit.id ? "Cadastro do representante" : "Novo representante"}</h3><button className="modal-x" onClick={() => setEdit(null)}>×</button></div>
        <div style={{ display: "grid", gap: 14, padding: 4 }}>
          <div className="com-sec">Dados principais</div>
          <label className="campo"><span>Nome *</span><input value={edit.nome || ""} onChange={(e) => set({ nome: e.target.value })} autoFocus /></label>
          <div className="com-grid2">
            <label className="campo"><span>WhatsApp (p/ relatórios)</span><input value={edit.whatsapp || ""} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="(00) 00000-0000" /></label>
            <label className="campo"><span>E-mail</span><input value={edit.email || ""} onChange={(e) => set({ email: e.target.value })} /></label>
          </div>
          <label className="campo"><span>Instagram</span><input value={edit.instagram || ""} onChange={(e) => set({ instagram: e.target.value })} placeholder="@perfil ou link" /></label>

          <div className="com-sec">Área de atuação</div>
          <label className="campo"><span>Estados que atende (carteira)</span><input value={edit.ufs || ""} onChange={(e) => set({ ufs: e.target.value })} placeholder="ex.: MG, SP, GO" /><small className="muted">Usado pra rotear o cliente da região pro representante certo.</small></label>
          <label className="campo"><span>Cidades que atende</span><textarea value={edit.cidades || ""} onChange={(e) => set({ cidades: e.target.value })} rows={2} placeholder="ex.: Belo Horizonte, Contagem, Uberlândia" /><small className="muted">Separe por vírgula. Deixe em branco se atende o estado inteiro.</small></label>
          <label className="campo"><span>Observações comerciais</span><textarea value={edit.observacao || ""} onChange={(e) => set({ observacao: e.target.value })} rows={2} /></label>

          <div className="com-sec">Comissão</div>
          <label className="campo"><span>Percentual padrão (%)</span><input type="number" step="0.1" min="0" value={edit.comissao ?? ""} onChange={(e) => set({ comissao: e.target.value === "" ? null : Number(e.target.value) })} placeholder="ex.: 5" /><small className="muted">Por enquanto a comissão é uma <b>estimativa</b> (% × total vendido). As regras oficiais (base, deduções) entram numa etapa seguinte.</small></label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={!!(edit.ativo ?? 1)} onChange={(e) => set({ ativo: e.target.checked ? 1 : 0 })} /><span>Representante ativo</span></label>
        </div>
        <div className="modal-ft" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-soft" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// ── VENDAS / RELATÓRIOS — em construção (próximas etapas) ─────────────────────────
function EmBreve({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="com-card">
      <h3 style={{ margin: "0 0 6px" }}>{titulo}</h3>
      <p className="muted" style={{ marginTop: 0 }}>Em desenvolvimento — próxima etapa da central de representantes.</p>
      <ul className="com-lista">{itens.map((i, k) => <li key={k}>{i}</li>)}</ul>
    </div>
  );
}
function AbaVendas() {
  return <EmBreve titulo="Vendas" itens={[
    "Importação automática das vendas do Syntech, com o representante identificado pelo código do vendedor (não só pelo nome).",
    "Lançamento de vendas retroativas, com controle de duplicidade e histórico de quem lançou/alterou.",
    "Correção do vínculo de um pedido ao representante certo, sem mexer nos dados do ERP.",
  ]} />;
}
function AbaRelatorios() {
  return <EmBreve titulo="Relatórios" itens={[
    "Relatório semanal (segunda a sábado) em PDF, individual por representante.",
    "Relatório mensal em PDF, com faturamento, pedidos, ticket médio e ranking de clientes.",
    "Relatório consolidado para o gestor, comparando os representantes.",
  ]} />;
}

// ── AUTOMAÇÕES — envio do relatório no WhatsApp ──────────────────────────────────
function AbaAutomacoes() {
  return (
    <>
      <RelatorioSemanalCard />
      <EmBreve titulo="Mais automações (em breve)" itens={[
        "Agendamento do relatório mensal, enviado após o fechamento do mês.",
        "Ativar/desativar o envio por representante.",
        "Histórico dos envios (data, tipo, destinatário, situação) com reenvio.",
      ]} />
    </>
  );
}

function RelatorioSemanalCard() {
  const [cfg, setCfg] = useState<{ ativo: boolean; numero: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  useEffect(() => { api.relatorioVendasConfig().then(setCfg).catch(() => {}); }, []);
  if (!cfg) return null;
  async function salvar(p: { ativo?: boolean; numero?: string }) {
    setSalvando(true);
    const atual = cfg as { ativo: boolean; numero: string };
    setCfg({ ...atual, ...p });
    try { await api.salvarRelatorioVendasConfig(p); } catch (e) { alert((e as Error).message); } finally { setSalvando(false); }
  }
  async function testar() {
    setTestando(true);
    try { const r = await api.testarRelatorioVendas(); alert(r.ok ? `✅ Resumo da semana (${r.de} a ${r.ate}) enviado pro WhatsApp ${r.numero}.` : `⚠️ Não enviou. Confira o número do gestor e a conexão do WhatsApp.`); }
    catch (e) { alert((e as Error).message); } finally { setTestando(false); }
  }
  return (
    <div className="com-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>📊 Relatório de vendas no WhatsApp</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>Toda segunda de manhã: cada representante recebe o dele e você recebe o resumo geral.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={cfg.ativo} disabled={salvando} onChange={(e) => salvar({ ativo: e.target.checked })} /> Enviar automático toda segunda</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>WhatsApp do gestor:<input value={cfg.numero} onChange={(e) => setCfg({ ...cfg, numero: e.target.value })} onBlur={(e) => salvar({ numero: e.target.value })} placeholder="só números com DDD" style={{ width: 170 }} /></label>
        <button className="btn btn-soft" disabled={testando} onClick={testar}>{testando ? "Enviando…" : "📲 Testar (manda o resumo pra você)"}</button>
      </div>
    </div>
  );
}
