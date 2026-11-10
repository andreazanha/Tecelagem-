// Baixa de estoque (ajuste/saída) — tirar peça do estoque por perda/defeito/brinde etc.
// A baixa CONFERE os carrinhos/pedidos ativos antes (trava): nunca baixa peça reservada
// (evita oversell). Nasce como pedido do cliente interno de AJUSTE; ao faturar sem cobrança
// no Syntech, o saldo cai e a ponte traz. O envio ao Syntech só liga com o cliente de
// AJUSTE configurado (documento) — senão a baixa fica retida, segurando a peça, até configurar.
import { useEffect, useState } from "react";
import { api } from "../api";

type Item = { ref: string; nome: string; cor: string; tamanho: string; saldo: number; reservado: number; livre: number };
type Baixa = { id: string; numero: string | null; motivo: string | null; created_at: string | null; status: string; erp_numero: number | null; erp_sync_erro: string | null; qtd: number; produto: string | null; cor: string | null; tamanho: string | null };

const nf = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");
const dataHora = (s: string | null) => { if (!s) return ""; const d = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z")); return isNaN(+d) ? s : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };

const STATUS: Record<string, { txt: string; cor: string }> = {
  pendente: { txt: "Aguardando Syntech", cor: "#b45309" },
  enviado: { txt: "Gravada no Syntech", cor: "#166534" },
  erro: { txt: "Erro ao gravar", cor: "#b91c1c" },
  rascunho: { txt: "Retida (configurar cliente)", cor: "#6b7280" },
};

export function EstoqueBaixa() {
  const [itens, setItens] = useState<Item[]>([]);
  const [baixas, setBaixas] = useState<Baixa[]>([]);
  const [cliente, setCliente] = useState<{ nome: string; configurado: boolean }>({ nome: "", configurado: false });
  const [q, setQ] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<Item | null>(null);
  const [qtd, setQtd] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [cfgAberto, setCfgAberto] = useState(false);

  function carregar(busca?: string) {
    setCarregando(true); setErro("");
    api.estoqueBaixaLista(busca ?? q).then((r) => {
      setItens(r.itens || []); setBaixas(r.baixas || []); setCliente(r.cliente || { nome: "", configurado: false });
    }).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false));
  }
  useEffect(() => { carregar(""); /* eslint-disable-next-line */ }, []);

  function abrir(it: Item) { setSel(it); setQtd("1"); setMotivo(""); setMsg(""); }

  async function confirmarBaixa() {
    if (!sel) return;
    const n = Math.round(Number(qtd) || 0);
    if (n < 1) { setMsg("Quantidade inválida."); return; }
    if (n > sel.livre) { setMsg(`Só dá pra baixar ${sel.livre} (o resto está reservado em carrinho/pedido).`); return; }
    if (!motivo.trim()) { setMsg("Diga o motivo da baixa."); return; }
    setSalvando(true); setMsg("");
    try {
      const r = await api.estoqueBaixar({ ref: sel.ref, cor: sel.cor, tamanho: sel.tamanho, qtd: n, motivo: motivo.trim(), produto: sel.nome });
      if (r.error) { setMsg(r.msg || r.error); setSalvando(false); return; }
      setSel(null);
      carregar();
    } catch (e) { setMsg((e as Error).message); }
    setSalvando(false);
  }

  async function cancelar(bx: Baixa) {
    if (!confirm(`Cancelar a baixa ${bx.numero || ""} (${nf(bx.qtd)} × ${bx.produto || ""})? A peça volta a ficar disponível.`)) return;
    const r = await api.estoqueBaixaCancelar(bx.id);
    if (r.error) { alert(r.msg || r.error); return; }
    carregar();
  }

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>📉 Baixa de Estoque</h2>
        <span className="muted" style={{ fontSize: 12 }}>Tirar peça do estoque (perda, defeito, brinde…). Confere carrinhos antes — não baixa peça reservada.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={() => carregar()}>↻ Atualizar</button>
      </div>

      {/* Cliente de ajuste (destino da baixa no Syntech) */}
      {!cliente.configurado && (
        <div className="card pad" style={{ marginBottom: 12, background: "#fff7ed", border: "1px solid #fed7aa" }}>
          <b style={{ color: "#9a3412" }}>⚠️ Cliente de ajuste não configurado.</b>
          <div className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
            A baixa já segura a peça aqui, mas <b>só é enviada ao Syntech</b> depois que você cadastrar o cliente interno de ajuste (ex.: "AJUSTE DE ESTOQUE") no Syntech e informar o documento (CPF/CNPJ) abaixo.
          </div>
          <button className="btn btn-soft" onClick={() => setCfgAberto(true)}>⚙️ Configurar cliente de ajuste</button>
        </div>
      )}
      {cliente.configurado && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Destino no Syntech: <b>{cliente.nome}</b> · <button className="linklike" onClick={() => setCfgAberto(true)} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", padding: 0, fontSize: 12 }}>alterar</button>
        </div>
      )}
      {cfgAberto && <ConfigCliente onFechar={() => setCfgAberto(false)} onSalvo={() => { setCfgAberto(false); carregar(); }} />}

      <div className="row-gap" style={{ gap: 8, marginBottom: 12 }}>
        <input className="input" placeholder="Buscar peça (nome, cor, tamanho)…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") carregar(); }} style={{ flex: "1 1 260px" }} />
        <button className="btn btn-soft" onClick={() => carregar()}>Buscar</button>
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
      {carregando && <div className="card pad muted">Carregando…</div>}

      {/* Lista de peças */}
      {!carregando && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>Peças em estoque</div>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Peça</th><th>Cor</th><th>Tam.</th><th className="num">Saldo</th><th className="num">Reservado</th><th className="num">Livre</th><th></th></tr></thead>
            <tbody>
              {itens.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 16 }}>Nenhuma peça encontrada.</td></tr>}
              {itens.map((it) => (
                <tr key={`${it.ref}|${it.cor}|${it.tamanho}`}>
                  <td>{it.nome}</td>
                  <td>{it.cor}</td>
                  <td>{it.tamanho || "—"}</td>
                  <td className="num">{nf(it.saldo)}</td>
                  <td className="num" style={{ color: it.reservado > 0 ? "#b45309" : undefined }}>{nf(it.reservado)}</td>
                  <td className="num" style={{ fontWeight: 700, color: it.livre > 0 ? "#166534" : "#b91c1c" }}>{nf(it.livre)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-soft" disabled={it.livre < 1} onClick={() => abrir(it)}>Baixar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Baixas recentes */}
      <div className="card">
        <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>Baixas recentes</div>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th>Quando</th><th>Peça</th><th className="num">Qtd</th><th>Motivo</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {baixas.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 16 }}>Nenhuma baixa ainda.</td></tr>}
            {baixas.map((bx) => {
              const st = STATUS[bx.status] || { txt: bx.status, cor: "#6b7280" };
              return (
                <tr key={bx.id}>
                  <td className="muted">{dataHora(bx.created_at)}</td>
                  <td>{bx.produto} {bx.cor ? <span className="muted">· {bx.cor}{bx.tamanho ? " " + bx.tamanho : ""}</span> : null}</td>
                  <td className="num">{nf(bx.qtd)}</td>
                  <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>{(bx.motivo || "").replace(/^Baixa de estoque — /, "")}</td>
                  <td><span style={{ color: st.cor, fontWeight: 600 }}>{st.txt}</span>{bx.erp_numero ? <span className="muted"> · nº {bx.erp_numero}</span> : null}{bx.status === "erro" && bx.erp_sync_erro ? <div className="muted" style={{ fontSize: 11 }}>{bx.erp_sync_erro}</div> : null}</td>
                  <td style={{ textAlign: "right" }}>
                    {bx.status !== "enviado" && <button className="btn btn-soft" onClick={() => cancelar(bx)}>Cancelar</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de baixa */}
      {sel && (
        <div className="modal-bg" onClick={() => !salvando && setSel(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="card pad" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw" }}>
            <h3 style={{ marginTop: 0 }}>Baixar peça</h3>
            <div style={{ marginBottom: 8 }}><b>{sel.nome}</b> · {sel.cor}{sel.tamanho ? " · " + sel.tamanho : ""}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Saldo {nf(sel.saldo)} · reservado {nf(sel.reservado)} · <b style={{ color: "#166534" }}>livre {nf(sel.livre)}</b></div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantidade a baixar</label>
            <input className="input" type="number" min={1} max={sel.livre} value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ width: 120, marginBottom: 10 }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Motivo</label>
            <input className="input" placeholder="ex.: defeito, perda, brinde, amostra" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
            {msg && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{msg}</div>}
            <div className="row-gap" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-soft" disabled={salvando} onClick={() => setSel(null)}>Cancelar</button>
              <button className="btn" disabled={salvando} onClick={confirmarBaixa}>{salvando ? "Baixando…" : "Confirmar baixa"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConfigCliente({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [doc, setDoc] = useState(""); const [nome, setNome] = useState(""); const [cod, setCod] = useState("");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => { api.baixaConfigGet().then((r) => { setDoc(r.doc || ""); setNome(r.nome || ""); setCod(r.cod || ""); }).catch(() => {}); }, []);
  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await api.baixaConfigSalvar({ doc, nome, cod });
      if (r.ok) onSalvo(); else setErro("Não salvou.");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }
  return (
    <div className="modal-bg" onClick={() => !salvando && onFechar()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="card pad" onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw" }}>
        <h3 style={{ marginTop: 0 }}>Cliente de ajuste de estoque</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Cadastre no Syntech um cliente interno (ex.: "AJUSTE DE ESTOQUE") que <b>não gera cobrança</b> e informe o documento aqui. As baixas vão como pedido pra esse cliente.
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Documento (CPF/CNPJ)</label>
        <input className="input" placeholder="só números" value={doc} onChange={(e) => setDoc(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Nome</label>
        <input className="input" placeholder="AJUSTE DE ESTOQUE" value={nome} onChange={(e) => setNome(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Código no Syntech <span className="muted">(opcional)</span></label>
        <input className="input" placeholder="deixe em branco se não souber" value={cod} onChange={(e) => setCod(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
        {erro && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <div className="row-gap" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-soft" disabled={salvando} onClick={onFechar}>Fechar</button>
          <button className="btn" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
