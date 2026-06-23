import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type PedidoTimeline } from "../api";
import { br, brLong, dur, FASE_INFO, FASES_ORDEM } from "../expedicaoUtil";

const opCod = (o: PedidoTimeline) => "OP " + (o.codigo_pai || o.numero_erp || o.pedido_id.slice(0, 6));

// Colunas (situações) de cada setor — alimentam o filtro extra quando um setor é escolhido.
const SITUACOES: Record<string, { value: string; label: string }[]> = {
  tecelagem: [{ value: "aguardando", label: "Aguardando" }, { value: "fazendo", label: "Tecendo" }, { value: "pronto", label: "Tecidos" }],
  passadoria: [{ value: "aguardando", label: "Aguardando" }, { value: "fazendo", label: "Passando" }],
  corte: [{ value: "aguardando", label: "Aguardando" }, { value: "fazendo", label: "Cortando" }, { value: "pronto", label: "Cortados" }],
  costura: [{ value: "aguardando", label: "Aguardando" }, { value: "fazendo", label: "Em costura" }, { value: "defeito", label: "Voltou com defeito" }],
  revisao: [{ value: "aguardando", label: "Aguardando" }, { value: "fazendo", label: "Revisando" }],
  expedicao: [{ value: "aguardando", label: "Aguardando" }, { value: "expedindo", label: "Expedindo" }],
  fiscal: [{ value: "aguardando", label: "Aguardando" }, { value: "cotando", label: "Cotando frete" }],
  transporte: [{ value: "aguardando", label: "Aguardando" }, { value: "enviado", label: "Enviado" }],
  entregue: [],
};
const PARTES_OPC = [
  { value: "parte-1", label: "Parte 1" },
  { value: "parte-2", label: "Parte 2" },
  { value: "parte-unica", label: "Única" },
  { value: "pronta-entrega", label: "Kit" },
];
const SETOR_PRODUCAO = ["tecelagem", "passadoria", "corte", "costura", "revisao"];
const situLabel = (setor: string, st: string) => SITUACOES[setor]?.find((s) => s.value === st)?.label || st;

// Todos os Pedidos: visão geral de rastreio. Filtros por mês e setor (fase atual),
// linha do tempo de cada pedido (por onde passou, tempo em cada fase) e em qual fase está.
export function TodosPedidos() {
  const [pedidos, setPedidos] = useState<PedidoTimeline[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState("");
  const [setor, setSetor] = useState("");
  const [situacao, setSituacao] = useState("");
  const [parte, setParte] = useState("");
  const [soPrioridade, setSoPrioridade] = useState(false);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<PedidoTimeline | null>(null);

  // Ao trocar de setor, zera os filtros de coluna (as opções mudam).
  useEffect(() => {
    setSituacao("");
    setParte("");
    setSoPrioridade(false);
  }, [setor]);

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
      pedidos.filter((o) => {
        if (q && !((o.numero_erp || "").toLowerCase().includes(q) || (o.codigo_pai || "").toLowerCase().includes(q) || (o.cliente_nome || "").toLowerCase().includes(q)))
          return false;
        if (situacao && !(o.situacoes || []).includes(situacao)) return false;
        if (parte && !(o.partesNoSetor || []).includes(parte)) return false;
        if (soPrioridade && !o.prioridade) return false;
        return true;
      }),
    [pedidos, q, situacao, parte, soPrioridade]
  );

  const mesLabel = (m: string) => {
    const [y, mm] = m.split("-");
    const nomes = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mm)] || mm} / ${y}`;
  };
  const mesAnoLongo = (m: string) => {
    if (m === "sem-data") return "Sem data";
    const [y, mm] = m.split("-");
    const nomes = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${nomes[Number(mm)] || mm} de ${y}`;
  };

  // Agrupa por ANO/MÊS (data do pedido, ou criação) — histórico fica para sempre, organizado.
  const grupos = useMemo(() => {
    const map = new Map<string, PedidoTimeline[]>();
    for (const o of filtrados) {
      const k = (o.data_pedido || o.created_at || "").slice(0, 7) || "sem-data";
      const arr = map.get(k);
      if (arr) arr.push(o);
      else map.set(k, [o]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtrados]);

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
        {setor && (SITUACOES[setor]?.length ?? 0) > 0 && (
          <label>
            <span>SITUAÇÃO / COLUNA</span>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              {SITUACOES[setor].map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        {setor && SETOR_PRODUCAO.includes(setor) && (
          <label>
            <span>PARTE</span>
            <select value={parte} onChange={(e) => setParte(e.target.value)}>
              <option value="">Todas</option>
              {PARTES_OPC.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        )}
        {setor && SETOR_PRODUCAO.includes(setor) && (
          <label className="tp-prio">
            <span>PRIORIDADE</span>
            <button type="button" className={"btn" + (soPrioridade ? " btn-primary" : "")} onClick={() => setSoPrioridade((v) => !v)}>
              {soPrioridade ? "★ Só urgentes" : "☆ Só urgentes"}
            </button>
          </label>
        )}
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
              {grupos.map(([mesKey, lista]) => (
                <Fragment key={mesKey}>
                  <tr className="tp-grupo">
                    <td colSpan={6}>
                      📅 {mesAnoLongo(mesKey)} <span className="tp-grupo-conta">· {lista.length} pedido(s)</span>
                    </td>
                  </tr>
                  {lista.map((o) => {
                    const fi = FASE_INFO[o.faseAtual] || { nome: o.faseAtual, ic: "•", cor: "#94a3b8" };
                    return (
                      <tr key={o.pedido_id} onClick={() => setAberto(o)} style={{ cursor: "pointer" }}>
                        <td><strong>{opCod(o)}</strong><div className="tp-pecas">{o.pecas} pç</div></td>
                        <td>{o.cliente_nome}</td>
                        <td><span className={"kparte " + (o.tipo === "MISTO" ? "kit" : o.tipo === "KIT" ? "kit" : o.tipo === "P1+P2" ? "p1" : "unica")}>{o.tipo}</span></td>
                        <td>
                          <span className="tp-fase" style={{ borderColor: fi.cor, color: fi.cor }}>{fi.ic} {fi.nome}</span>
                          {(o.situacoes || []).length > 0 && (
                            <div className="tp-pecas">{o.prioridade ? "★ " : ""}{(o.situacoes || []).map((s) => situLabel(o.faseAtual, s)).join(" · ")}</div>
                          )}
                          {o.transportadora && <div className="tp-pecas">{o.transportadora}</div>}
                        </td>
                        <td><Progresso idx={o.idx} /></td>
                        <td><strong>{br(o.data_entrega)}</strong></td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
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
