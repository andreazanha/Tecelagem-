import { useEffect, useMemo, useState } from "react";
import { api, type CardProducao } from "../api";
import { historico } from "../historico";

const TIPO: Record<string, { label: string; cls: string }> = {
  "parte-1": { label: "PARTE 1", cls: "p1" },
  "parte-2": { label: "PARTE 2", cls: "p2" },
  "parte-unica": { label: "ÚNICA", cls: "unica" },
  "pronta-entrega": { label: "KIT", cls: "kit" },
};
const opCodigo = (c: CardProducao) =>
  (c.parte === "pronta-entrega" ? "KIT " : "OP ") + (c.codigo_pai || c.numero_erp || c.pedido_id.slice(0, 6));
const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
const brLong = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
const SETOR_INFO: Record<string, { nome: string; ic: string; cor: string }> = {
  tecelagem: { nome: "Tecelagem", ic: "🧶", cor: "#6366f1" },
  passadoria: { nome: "Passadoria", ic: "🔥", cor: "#f97316" },
  corte: { nome: "Corte", ic: "✂️", cor: "#06b6d4" },
  costura: { nome: "Costura", ic: "🪡", cor: "#ec4899" },
  revisao: { nome: "Revisão", ic: "🔍", cor: "#eab308" },
  expedicao: { nome: "Expedição", ic: "📦", cor: "#22c55e" },
};
const dur = (min: number) => {
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
};
// Vendedor às vezes vem poluído do PDF ("PEDRO HENRIQUE 35992103017 EMITENTE Entrega:…").
// Mostra só o nome: corta no 1º número longo ou nas palavras de ruído.
const limparVendedor = (v?: string | null) => {
  if (!v) return "—";
  let s = v.split(/\s+\d{4,}/)[0];
  s = s.split(/\s*\b(EMITENTE|ENTREGA|TRANSPORTADOR|FONES?|OBS|ADICION|CNPJ|CPF|RG|INSCR)/i)[0];
  s = s.replace(/[-–·,;:]+\s*$/, "").trim();
  return s || "—";
};
const brDT = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  return isNaN(+d) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export interface ColCfg {
  cor: "aguardando" | "fazendo" | "pronto";
  titulo: string;
  sub: string;
  status: "aguardando" | "fazendo" | "pronto";
  tipos?: string[];
  acao: "fazer" | "finalizar" | "enviar";
}
export interface QuadroCfg {
  setor: string;
  titulo: string;
  fazerLabel: string;
  fazendoLabel: string;
  proxSetor: string | null;
  pedeMaquina: boolean;
  recursoLabel: string;
  recursoTotal: number;
  statRecursoLabel: string;
  statFila: string;
  statFazendo: string;
  statPronto: string;
  mostrarMaquinas: boolean;
  nota: string;
  colunas: ColCfg[];
}

export function Quadro({ cfg }: { cfg: QuadroCfg }) {
  const [cards, setCards] = useState<CardProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<CardProducao | null>(null);
  const [iniciar, setIniciar] = useState<CardProducao | null>(null);
  const [busca, setBusca] = useState("");

  function recarregar() {
    api
      .listarProducao(cfg.setor)
      .then(setCards)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, [cfg.setor]);

  // Recarrega quando uma ação é desfeita/refeita em qualquer tela.
  useEffect(() => {
    const h = () => recarregar();
    window.addEventListener("historico:mudou", h);
    return () => window.removeEventListener("historico:mudou", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.setor]);

  async function mudar(c: CardProducao, body: { status: string; setor?: string; maquina?: string; operador?: string }) {
    const antes = { status: c.status, setor: c.setor, operador: c.operador ?? "" };
    await api.atualizarProducao(c.pedido_id, c.parte, body);
    historico.registrar({
      label: opCodigo(c),
      desfazer: () => api.atualizarProducao(c.pedido_id, c.parte, { status: antes.status, setor: antes.setor, operador: antes.operador }),
      refazer: () => api.atualizarProducao(c.pedido_id, c.parte, body),
    });
    setAberto(null);
    recarregar();
  }
  function acaoCard(c: CardProducao, acao: ColCfg["acao"]) {
    if (acao === "fazer") setIniciar(c);
    else if (acao === "finalizar") mudar(c, { status: "pronto" });
    else if (cfg.proxSetor) mudar(c, { setor: cfg.proxSetor, status: "aguardando" });
  }

  const stLabel = (s: string) => (s === "fazendo" ? cfg.fazendoLabel : s === "pronto" ? "Pronto" : "Aguardando");
  const ativos = useMemo(() => cards.filter((c) => c.status === "fazendo"), [cards]);
  const maquinas = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of ativos) if (c.maquina) m.set(c.maquina, opCodigo(c));
    return Array.from({ length: 8 }, (_, i) => ({ nome: `Máq ${i + 1}`, op: m.get(`Máq ${i + 1}`) || null }));
  }, [ativos]);
  const hoje = new Date().toISOString().slice(0, 10);
  const noPrazo = cards.filter((c) => !c.data_entrega || c.data_entrega >= hoje).length;
  const pct = cards.length ? Math.round((noPrazo / cards.length) * 100) : 100;
  const aguard = cards.filter((c) => c.status === "aguardando").length;
  const prontos = cards.filter((c) => c.status === "pronto").length;
  const recursoAtivo = cfg.mostrarMaquinas
    ? maquinas.filter((m) => m.op).length
    : new Set(ativos.map((c) => c.operador).filter(Boolean)).size;

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? cards.filter(
        (c) =>
          (c.numero_erp || "").toLowerCase().includes(q) ||
          (c.codigo_pai || "").toLowerCase().includes(q) ||
          (c.cliente_nome || "").toLowerCase().includes(q) ||
          (c.codigo_terceiro || "").toLowerCase().includes(q)
      )
    : cards;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{cfg.titulo}</h1>
          <div className="breadcrumb">Produção › {cfg.titulo}</div>
        </div>
        <div className="row-gap">
          <input
            className="busca-ped"
            placeholder="🔎 Pedido, código pai, terceiro ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      <div className="stats">
        <Stat n={aguard} l={cfg.statFila} />
        <Stat n={ativos.length} l={cfg.statFazendo} />
        <Stat n={prontos} l={cfg.statPronto} />
        <Stat n={`${pct}%`} l="No prazo" />
        <Stat n={`${recursoAtivo} / ${cfg.recursoTotal}`} l={cfg.statRecursoLabel} />
      </div>

      {cfg.mostrarMaquinas && (
        <div className="maqstrip">
          {maquinas.map((m) => (
            <span key={m.nome} className={"maqchip" + (m.op ? "" : " livre")}>
              {m.nome} · {m.op || "livre"}
            </span>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <>
          <div className="kanban">
            {cfg.colunas.map((col, i) => {
              const lista = filtrados.filter(
                (c) => c.status === col.status && (!col.tipos || col.tipos.includes(c.parte))
              );
              return <Coluna key={i} col={col} cards={lista} cfg={cfg} stLabel={stLabel} onAbrir={setAberto} onAcao={acaoCard} />;
            })}
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            {cfg.nota}
          </p>
        </>
      )}

      {aberto && (
        <CardModal card={aberto} cfg={cfg} stLabel={stLabel} onFechar={() => setAberto(null)} onAcao={acaoCard} />
      )}

      {iniciar && (
        <IniciarModal
          card={iniciar}
          cfg={cfg}
          onFechar={() => setIniciar(null)}
          onConfirmar={(operador) => {
            const c = iniciar;
            setIniciar(null);
            mudar(c, { status: "fazendo", operador });
          }}
        />
      )}
    </>
  );
}

function IniciarModal({
  card,
  cfg,
  onFechar,
  onConfirmar,
}: {
  card: CardProducao;
  cfg: QuadroCfg;
  onFechar: () => void;
  onConfirmar: (operador: string) => void;
}) {
  const [ops, setOps] = useState<{ id: string; nome: string }[]>([]);
  const [opId, setOpId] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .listarOperadores(cfg.setor)
      .then((o) => {
        setOps(o);
        if (o[0]) setOpId(o[0].id);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [cfg.setor]);

  async function confirmar() {
    setErro("");
    if (!opId) return setErro("Selecione o operador.");
    if (!senha) return setErro("Digite a senha.");
    setEnviando(true);
    try {
      const r = await api.validarOperador(opId, senha);
      if (!r.ok || !r.nome) {
        setErro("Senha incorreta.");
        setEnviando(false);
        return;
      }
      onConfirmar(r.nome);
    } catch {
      setErro("Erro ao validar. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{opCodigo(card)}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">Iniciar produção</span>
          </div>
        </div>

        <div className="modal-bd">
          {carregando ? (
            <div className="muted">Carregando operadores…</div>
          ) : ops.length === 0 ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Nenhum operador cadastrado. Cadastre em <strong>Cadastros › Operadores</strong>.
            </div>
          ) : (
            <>
              <label className="campo-l" htmlFor="op-sel">OPERADOR</label>
              <select
                id="op-sel"
                value={opId}
                onChange={(e) => setOpId(e.target.value)}
                style={{ width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 }}
              >
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>

              <label className="campo-l" htmlFor="op-senha" style={{ marginTop: 14, display: "block" }}>SENHA</label>
              <input
                id="op-senha"
                type="password"
                value={senha}
                autoFocus
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmar()}
                placeholder="••••"
                style={{ width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 }}
              />
              {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{erro}</div>}
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn tecer" disabled={enviando || carregando || ops.length === 0} onClick={confirmar}>
            {enviando ? "Validando…" : cfg.fazerLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function btnDe(acao: ColCfg["acao"], cfg: QuadroCfg) {
  if (acao === "fazer") return { cls: "tecer", label: cfg.fazerLabel };
  if (acao === "finalizar") return { cls: "final", label: "Finalizar" };
  return { cls: "enviar", label: "Enviar ▶" };
}

function Coluna({
  col,
  cards,
  cfg,
  stLabel,
  onAbrir,
  onAcao,
}: {
  col: ColCfg;
  cards: CardProducao[];
  cfg: QuadroCfg;
  stLabel: (s: string) => string;
  onAbrir: (c: CardProducao) => void;
  onAcao: (c: CardProducao, acao: ColCfg["acao"]) => void;
}) {
  const btn = btnDe(col.acao, cfg);
  return (
    <div className="kcol">
      <div className="kcol-head">
        <div>
          <div className="kcol-title">
            <span className={"kdot " + col.cor} /> {col.titulo}
          </div>
          <div className="kcol-sub">{col.sub}</div>
        </div>
        <span className={"kcol-count " + col.cor}>{cards.length}</span>
      </div>
      <div className="kcol-body">
        {cards.map((c) => {
          const t = TIPO[c.parte] || { label: c.parte, cls: "" };
          return (
            <div key={c.pedido_id + c.parte} className="kcard" onClick={() => onAbrir(c)} style={{ cursor: "pointer" }}>
              <div className={"kcard-hd " + t.cls}>
                <span className="kcard-op">{opCodigo(c)}</span>
                <span className="kcard-badge">{t.label}</span>
              </div>
              <div className="kcard-bd">
                <div className="kcard-row1">
                  <span className="kcard-cli">{c.cliente_nome}</span>
                  <span className={"kstatus " + c.status}>{stLabel(c.status)}</span>
                </div>
                <div className="kcard-prod">
                  {c.pecas} pç · {c.resumo || ""}
                </div>
                <div className="kcard-boxes">
                  <div className="kbox ped">
                    <div className="kbox-l">PEDIDO</div>
                    <div className="kbox-v">{br(c.data_pedido)}</div>
                  </div>
                  <div className="kbox ent">
                    <div className="kbox-l">ENTREGA</div>
                    <div className="kbox-v">{br(c.data_entrega)}</div>
                  </div>
                </div>
                <div className="kcard-foot">
                  <span className="kcard-hint">
                    {c.status === "fazendo"
                      ? `${c.maquina ? c.maquina + " · " : ""}${c.operador || "—"}`
                      : "toque p/ detalhes"}
                  </span>
                  <button
                    className={"kbtn " + btn.cls}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcao(c, col.acao);
                    }}
                  >
                    {btn.label}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {cards.length === 0 && (
          <div
            style={{
              border: "1.5px dashed #e2e8f0",
              borderRadius: 12,
              padding: "18px 10px",
              textAlign: "center",
              color: "#cbd5e1",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            vazio
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="campo-l">{l}</div>
      <div className="campo-v">{v}</div>
    </div>
  );
}

function CardModal({
  card,
  cfg,
  stLabel,
  onFechar,
  onAcao,
}: {
  card: CardProducao;
  cfg: QuadroCfg;
  stLabel: (s: string) => string;
  onFechar: () => void;
  onAcao: (c: CardProducao, acao: ColCfg["acao"]) => void;
}) {
  const [det, setDet] = useState<Awaited<ReturnType<typeof api.detalheProducao>> | null>(null);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof api.historicoProducao>> | null>(null);
  const [verHist, setVerHist] = useState(false);
  useEffect(() => {
    api.detalheProducao(card.pedido_id, card.parte).then(setDet).catch(() => {});
    api.historicoProducao(card.pedido_id, card.parte).then(setHist).catch(() => {});
  }, [card.pedido_id, card.parte]);

  const t = TIPO[card.parte] || { label: card.parte, cls: "" };
  const origem =
    card.status === "fazendo" ? `${cfg.titulo} · ${card.maquina || card.operador || "—"}` : cfg.titulo;

  let faltam = "";
  if (card.data_entrega) {
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    const e = new Date(card.data_entrega + "T00:00:00");
    const d = Math.round((e.getTime() - h.getTime()) / 86400000);
    faltam = d < 0 ? `${-d} dia(s) atrasado` : d === 0 ? "entrega hoje" : `faltam ${d} dia(s)`;
  }
  const acaoAtual: ColCfg["acao"] =
    card.status === "aguardando" ? "fazer" : card.status === "fazendo" ? "finalizar" : "enviar";
  const btn = btnDe(acaoAtual, cfg);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + t.cls}>
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{opCodigo(card)}</span>
              <span className="modal-pill">{t.label}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>
              ✕
            </button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{card.cliente_nome}</span>
            <span className={"kstatus " + card.status}>
              {cfg.titulo} · {stLabel(card.status)}
            </span>
          </div>
        </div>

        <div className="modal-bd">
          <div className="modal-boxes">
            <div className="kbox ped" style={{ padding: "12px 14px" }}>
              <div className="kbox-l">DATA DO PEDIDO</div>
              <div className="kbox-v" style={{ fontSize: 20 }}>{brLong(card.data_pedido)}</div>
            </div>
            <div className="kbox ent" style={{ padding: "12px 14px" }}>
              <div className="kbox-l">DATA DE ENTREGA</div>
              <div className="kbox-v" style={{ fontSize: 20 }}>{brLong(card.data_entrega)}</div>
              {faltam && (
                <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginTop: 2 }}>⚠ {faltam}</div>
              )}
            </div>
          </div>

          <div className="modal-grid">
            <Campo l="TIPO" v={t.label} />
            <Campo l="QUANTIDADE" v={`${card.pecas} peças`} />
            <Campo l="RESPONSÁVEL" v={card.operador || "—"} />
            <Campo l="VENDEDOR" v={limparVendedor(det?.vendedor)} />
            {card.codigo_pai && <Campo l="PEDIDOS" v={card.numero_erp || "—"} />}
            <Campo l="CÓDIGO DE TERCEIRO" v={det?.codigo_terceiro || "—"} />
            <Campo l="ORIGEM" v={origem} />
          </div>

          {det?.observacao && (
            <div style={{ marginTop: 14 }}>
              <div className="campo-l">OBSERVAÇÃO</div>
              <div
                style={{
                  marginTop: 4, padding: "10px 12px", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c",
                  fontWeight: 600, fontSize: 14, whiteSpace: "pre-wrap",
                }}
              >
                {det.observacao}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="campo-l">LINHA DO TEMPO</div>
            <button className="btn btn-soft" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setVerHist(true)}>
              🕓 Histórico completo
            </button>
          </div>
          <div className="tl">
            {!hist ? (
              <div className="muted" style={{ fontSize: 13 }}>Carregando…</div>
            ) : (
              hist.passagens.map((p, i) => {
                const s = SETOR_INFO[p.setor] || { nome: p.setor, ic: "•", cor: "#94a3b8" };
                return (
                  <div className="tl-row" key={i}>
                    <span className="tl-dot" style={{ background: s.cor }}>{s.ic}</span>
                    {i < hist.passagens.length - 1 && <span className="tl-line" />}
                    <div className="tl-body">
                      <div className="tl-top">
                        <strong>{s.nome}</strong>
                        {p.atual ? <span className="tl-badge agora">aqui agora</span> : <span className="tl-dur">{dur(p.duracaoMin)}</span>}
                      </div>
                      <div className="tl-meta">
                        👤 {p.operador || "—"} · entrou {brDT(p.entrouEm)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>
            Fechar
          </button>
          <button className={"kbtn " + btn.cls} onClick={() => onAcao(card, acaoAtual)}>
            {btn.label}
          </button>
        </div>
      </div>

      {verHist && hist && (
        <HistoricoModal hist={hist} titulo={opCodigo(card)} cliente={card.cliente_nome} onFechar={() => setVerHist(false)} />
      )}
    </div>
  );
}

function HistoricoModal({
  hist,
  titulo,
  cliente,
  onFechar,
}: {
  hist: NonNullable<Awaited<ReturnType<typeof api.historicoProducao>>>;
  titulo: string;
  cliente: string;
  onFechar: () => void;
}) {
  return (
    <div className="modal-bg" onClick={(e) => { e.stopPropagation(); onFechar(); }}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{titulo}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">Histórico do pedido</span>
            <span className="kstatus fazendo">{dur(hist.totalMin)} no total</span>
          </div>
        </div>

        <div className="modal-bd">
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {cliente} · criado em {brDT(hist.criadoEm)}
          </div>
          <div className="tl">
            {hist.passagens.map((p, i) => {
              const s = SETOR_INFO[p.setor] || { nome: p.setor, ic: "•", cor: "#94a3b8" };
              return (
                <div className="tl-row big" key={i}>
                  <span className="tl-dot" style={{ background: s.cor }}>{s.ic}</span>
                  {i < hist.passagens.length - 1 && <span className="tl-line" />}
                  <div className="tl-body">
                    <div className="tl-top">
                      <strong>{s.nome}</strong>
                      {p.atual ? <span className="tl-badge agora">aqui agora</span> : <span className="tl-badge">{dur(p.duracaoMin)}</span>}
                    </div>
                    <div className="tl-meta">👤 Operador: <strong>{p.operador || "—"}</strong></div>
                    <div className="tl-meta">
                      Entrou {brDT(p.entrouEm)}{p.saiuEm ? ` · saiu ${brDT(p.saiuEm)}` : " · ainda neste setor"}
                    </div>
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
