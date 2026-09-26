import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao } from "../api";
import { br, opCodigo, tipoDe, resumoVolumes, parseVolumes, TRANSPORTADORAS, transpNome } from "../expedicaoUtil";

// Transporte: pedidos com NF emitida entram em "Aguardando". As transportadoras ficam FECHADAS
// (tiles com a contagem); clicar abre e mostra os pedidos dela. Cada pedido aguardando tem um botão
// "Enviar" com a LISTA de transportadoras. Cards numa transportadora somem após 15 dias (backend).
export function Transporte() {
  const [cards, setCards] = useState<CardExpedicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);   // transportadora expandida
  const [enviar, setEnviar] = useState<string | null>(null);    // pedido com o menu "Enviar" aberto

  function recarregar() {
    api
      .listarExpedicao("transporte")
      .then((d) => Array.isArray(d) && setCards(d))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => { setCarregando(true); recarregar(); }, []);

  async function atribuir(c: CardExpedicao, slug: string) {
    setEnviar(null);
    try { await api.atualizarExpedicao(c.pedido_id, { status: "enviado", transportadora: slug }); }
    catch { alert("Não foi possível atribuir. Tente novamente."); }
    finally { recarregar(); }
  }
  async function voltarAguardando(c: CardExpedicao) {
    try { await api.atualizarExpedicao(c.pedido_id, { status: "aguardando", transportadora: null }); }
    catch { alert("Não foi possível voltar. Tente novamente."); }
    finally { recarregar(); }
  }

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () => q
      ? cards.filter((c) =>
          (c.numero_erp || "").toLowerCase().includes(q) ||
          (c.codigo_pai || "").toLowerCase().includes(q) ||
          (c.cliente_nome || "").toLowerCase().includes(q) ||
          (c.nf_numero || "").toLowerCase().includes(q))
      : cards,
    [cards, q]
  );
  const aguardando = filtrados.filter((c) => !c.transportadora);
  const daTransp = (slug: string) => filtrados.filter((c) => c.transportadora === slug);

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>Transporte</h1>
          <div className="breadcrumb">Produção › Transporte</div>
        </div>
        <div className="row-gap">
          <input className="busca-ped" placeholder="🔎 Pedido, cliente, NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <>
          {/* Transportadoras FECHADAS — clicar abre o conteúdo */}
          <div className="tr2-tiles">
            {TRANSPORTADORAS.map((tr) => {
              const n = daTransp(tr.slug).length;
              const on = aberta === tr.slug;
              return (
                <button key={tr.slug} className={"tr2-tile" + (on ? " on" : "")} style={on ? { borderColor: tr.cor } : undefined} onClick={() => setAberta(on ? null : tr.slug)}>
                  <span className="tr2-ini" style={{ background: tr.cor }}>{tr.ini}</span>
                  <span className="tr2-nome">{tr.nome}</span>
                  <span className="tr2-n" style={n ? { background: tr.cor } : undefined}>{n}</span>
                  <span className="tr2-car">{on ? "▲" : "▼"}</span>
                </button>
              );
            })}
          </div>

          {/* Conteúdo da transportadora aberta */}
          {aberta && (
            <div className="tr2-painel">
              <div className="tr2-painel-h">🚚 {transpNome(aberta)} <span className="tr2-painel-n">{daTransp(aberta).length} pedido(s)</span>
                <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setAberta(null)}>Fechar ✕</button>
              </div>
              <div className="tr2-painel-b">
                {daTransp(aberta).length === 0 && <div className="kcol-vazio">Nenhum pedido nesta transportadora.</div>}
                {daTransp(aberta).map((c) => {
                  const t = tipoDe(c.partes);
                  const vols = parseVolumes(c.volumes);
                  return (
                    <div className="tr2-row" key={c.pedido_id}>
                      <span className={"exp-tp " + t.cls}>{t.label}</span>
                      <div className="tr2-idcli"><span className="tr2-num">{opCodigo(c)}</span><span className="tr2-cli">{c.cliente_nome}</span></div>
                      <span className="tr2-meta">{c.pecas || 0} pç · {resumoVolumes(vols)}{c.nf_numero ? ` · NF ${c.nf_numero}` : ""}</span>
                      <span className="tr2-meta">despachado {br(c.entrou_em)} · some em 15 dias</span>
                      <button className="kbtn" style={{ background: "#e2e8f0", color: "#475569" }} onClick={() => voltarAguardando(c)}>↩ Voltar</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aguardando — full width + botão Enviar (lista de transportadoras) */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="exp-colh" style={{ background: "linear-gradient(90deg,#f59e0b,#d97706)" }}><span>⏳ Aguardando transportadora</span><span className="exp-c">{aguardando.length}</span></div>
            <div className="exp-list">
              {aguardando.length === 0 && <div className="kcol-vazio">Nenhum pedido aguardando.</div>}
              {aguardando.map((c) => {
                const t = tipoDe(c.partes);
                const vols = parseVolumes(c.volumes);
                return (
                  <div className="tr2-wrow" key={c.pedido_id}>
                    <span className={"exp-tp " + t.cls}>{t.label}</span>
                    <div className="tr2-idcli"><span className="tr2-num">{opCodigo(c)}</span><span className="tr2-cli">{c.cliente_nome}</span></div>
                    <span className="tr2-meta">{c.pecas || 0} pç · {resumoVolumes(vols)}</span>
                    <span className="tr2-meta">{c.nf_numero ? `NF ${c.nf_numero}` : "—"}{c.frete ? ` · 💰 ${c.frete}` : ""}</span>
                    <div className="tr2-enviar">
                      <button className="kbtn tecer" onClick={() => setEnviar(enviar === c.pedido_id ? null : c.pedido_id)}>Enviar ▾</button>
                      {enviar === c.pedido_id && (
                        <div className="tr2-menu">
                          {TRANSPORTADORAS.map((tr) => (
                            <button key={tr.slug} className="tr2-mi" style={{ borderColor: tr.cor, color: tr.cor }} onClick={() => atribuir(c, tr.slug)}>
                              <span className="tr2-mi-ini" style={{ background: tr.cor }}>{tr.ini}</span>{tr.nome}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        As transportadoras ficam fechadas — clique numa para ver os pedidos dela. Em "Aguardando", use <b>Enviar ▾</b> e escolha a transportadora. Pedidos despachados somem automaticamente após 15 dias (ficam no histórico).
      </p>
    </div>
  );
}
