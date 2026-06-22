import { useEffect, useMemo, useState } from "react";
import { api, type PedidoTimeline } from "../api";
import { br, brLong, dur, FASE_INFO, FASES_ORDEM } from "../expedicaoUtil";

const opCod = (o: PedidoTimeline) => "OP " + (o.codigo_pai || o.numero_erp || o.pedido_id.slice(0, 6));

// Todos os Pedidos: visão geral de rastreio. Filtros por mês e setor (fase atual),
// linha do tempo de cada pedido (por onde passou, tempo em cada fase) e em qual fase está.
export function TodosPedidos() {
  const [pedidos, setPedidos] = useState<PedidoTimeline[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState("");
  const [setor, setSetor] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<PedidoTimeline | null>(null);

  function recarregar() {
    setCarregando(true);
    api
      .todosPedidos({ mes, setor })
      .then((d) => Array.isArray(d) && setPedidos(d))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, setor]);

  // Opções de mês a partir dos próprios pedidos (carrega tudo uma vez sem filtro p/ montar a lista).
  const [meses, setMeses] = useState<string[]>([]);
  useEffect(() => {
    api
      .todosPedidos()
      .then((d) => {
        const set = new Set<string>();
        for (const o of d) {
          const m = (o.data_pedido || o.created_at || "").slice(0, 7);
          if (m) set.add(m);
        }
        setMeses([...set].sort().reverse());
      })
      .catch(() => {});
  }, []);

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      q
        ? pedidos.filter(
            (o) =>
              (o.numero_erp || "").toLowerCase().includes(q) ||
              (o.codigo_pai || "").toLowerCase().includes(q) ||
              (o.cliente_nome || "").toLowerCase().includes(q)
          )
        : pedidos,
    [pedidos, q]
  );

  const mesLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const nomes = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mm)] || mm} / ${y}`;
  };

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>Todos os Pedidos</h1>
          <div className="breadcrumb">Gestão › Todos os Pedidos</div>
        </div>
        <button className="btn" onClick={recarregar}>↻ Atualizar</button>
      </div>

      <div className="tp-filtros">
        <label>
          <span>MÊS</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>{mesLabel(m)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>SETOR / FASE ATUAL</span>
          <select value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos os setores</option>
            {FASES_ORDEM.map((f) => (
              <option key={f} value={f}>{FASE_INFO[f].nome}</option>
            ))}
          </select>
        </label>
        <label className="tp-busca">
          <span>BUSCA RÁPIDA</span>
          <input placeholder="🔎 Pedido, OP, cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="tp-conta">{filtrados.length} pedido(s)</div>
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="card tp-tabela-wrap">
          <table className="tp-tabela">
            <thead>
              <tr>
                <th>PEDIDO</th>
                <th>CLIENTE</th>
                <th>TIPO</th>
                <th>FASE ATUAL</th>
                <th>ONDE ESTÁ</th>
                <th>ENTREGA</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => {
                const fi = FASE_INFO[o.faseAtual] || { nome: o.faseAtual, ic: "•", cor: "#94a3b8" };
                return (
                  <tr key={o.pedido_id} onClick={() => setAberto(o)} style={{ cursor: "pointer" }}>
                    <td><strong>{opCod(o)}</strong><div className="tp-pecas">{o.pecas} pç</div></td>
                    <td>{o.cliente_nome}</td>
                    <td><span className={"kparte " + (o.tipo === "MISTO" ? "kit" : o.tipo === "KIT" ? "kit" : o.tipo === "P1+P2" ? "p1" : "unica")}>{o.tipo}</span></td>
                    <td>
                      <span className="tp-fase" style={{ borderColor: fi.cor, color: fi.cor }}>{fi.ic} {fi.nome}</span>
                      {o.transportadora && <div className="tp-pecas">{o.transportadora}</div>}
                    </td>
                    <td><Progresso idx={o.idx} /></td>
                    <td><strong>{br(o.data_entrega)}</strong></td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#94a3b8" }}>nenhum pedido encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aberto && <TimelineModal pedido={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

// Barra de progresso das 9 fases.
function Progresso({ idx }: { idx: number }) {
  return (
    <div className="tp-prog">
      {FASES_ORDEM.map((f, i) => {
        const fi = FASE_INFO[f];
        const ativo = i <= idx;
        return (
          <span
            key={f}
            className={"tp-prog-dot" + (i === idx ? " atual" : "")}
            title={fi.nome}
            style={{ background: ativo ? fi.cor : "#e2e8f0" }}
          />
        );
      })}
    </div>
  );
}

function TimelineModal({ pedido, onFechar }: { pedido: PedidoTimeline; onFechar: () => void }) {
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd kit">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{opCod(pedido)}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{pedido.cliente_nome}</span>
            <span className="kstatus fazendo">{pedido.pecas} pç</span>
          </div>
        </div>
        <div className="modal-bd">
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Pedido {brLong(pedido.data_pedido)} · entrega {brLong(pedido.data_entrega)}
          </div>
          <div className="campo-l" style={{ marginBottom: 8 }}>LINHA DO TEMPO</div>
          <div className="tl">
            {pedido.passagens.map((p, i) => {
              const fi = FASE_INFO[p.fase] || { nome: p.fase, ic: "•", cor: "#94a3b8" };
              return (
                <div className="tl-row big" key={i}>
                  <span className="tl-dot" style={{ background: fi.cor }}>{fi.ic}</span>
                  {i < pedido.passagens.length - 1 && <span className="tl-line" />}
                  <div className="tl-body">
                    <div className="tl-top">
                      <strong>{fi.nome}</strong>
                      {p.atual ? <span className="tl-badge agora">aqui agora</span> : <span className="tl-badge">{dur(p.duracaoMin)}</span>}
                    </div>
                    <div className="tl-meta">Entrou {brLong(p.entrouEm)}{p.atual ? "" : ` · ${dur(p.duracaoMin)} nesta fase`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
