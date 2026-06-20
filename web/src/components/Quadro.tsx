import { useEffect, useMemo, useState } from "react";
import { api, type CardProducao } from "../api";

const TIPO: Record<string, { label: string; cls: string }> = {
  "parte-1": { label: "PARTE 1", cls: "p1" },
  "parte-2": { label: "PARTE 2", cls: "p2" },
  "parte-unica": { label: "ÚNICA", cls: "unica" },
  "pronta-entrega": { label: "KIT", cls: "kit" },
};
const opCodigo = (c: CardProducao) =>
  (c.parte === "pronta-entrega" ? "KIT " : "OP ") + (c.numero_erp || c.pedido_id.slice(0, 6));
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

  async function mudar(c: CardProducao, body: { status: string; setor?: string; maquina?: string; operador?: string }) {
    await api.atualizarProducao(c.pedido_id, c.parte, body);
    setAberto(null);
    recarregar();
  }
  function fazer(c: CardProducao) {
    let extra: { maquina?: string; operador?: string } = {};
    if (cfg.pedeMaquina) {
      const maquina = window.prompt("Máquina:", c.parte === "parte-2" ? "Máq 7" : "Máq 3");
      if (maquina === null) return;
      const operador = window.prompt("Operador:", c.operador || "") ?? "";
      extra = { maquina, operador };
    } else {
      const operador = window.prompt(`${cfg.recursoLabel} (quem vai fazer):`, c.operador || "");
      if (operador === null) return;
      extra = { operador };
    }
    mudar(c, { status: "fazendo", ...extra });
  }
  function acaoCard(c: CardProducao, acao: ColCfg["acao"]) {
    if (acao === "fazer") fazer(c);
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{cfg.titulo}</h1>
          <div className="breadcrumb">Produção › {cfg.titulo}</div>
        </div>
        <button className="btn" onClick={recarregar}>
          ↻ Atualizar
        </button>
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
      ) : cards.length === 0 ? (
        <div className="card pad empty">
          Nada em {cfg.titulo} ainda. As partes chegam aqui quando são enviadas da fase anterior.
        </div>
      ) : (
        <>
          <div className="kanban">
            {cfg.colunas.map((col, i) => {
              const lista = cards.filter(
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
    </>
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
        {cards.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 12 }}>—</div>}
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
  useEffect(() => {
    api.detalheProducao(card.pedido_id, card.parte).then(setDet).catch(() => {});
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
  const cores = [...new Set((det?.blocos || []).map((b) => b.cor).filter(Boolean))].join(", ");
  const modelos = [...new Set((det?.blocos || []).map((b) => b.modelo).filter(Boolean))].join(", ");
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
            <Campo l="PRODUTO" v={modelos || card.resumo || "—"} />
            <Campo l="COR / GRADE" v={cores || "—"} />
            <Campo l="ORIGEM" v={origem} />
            <Campo l="RESPONSÁVEL" v={card.operador || "—"} />
            <Campo l="VENDEDOR" v={det?.vendedor || "—"} />
            <Campo l="SETOR ATUAL" v={cfg.titulo} />
          </div>

          {!!(det?.blocos || []).length && (
            <div style={{ marginTop: 14 }}>
              <div className="campo-l">ITENS</div>
              <div className="modal-itens">
                {det!.blocos.map((b, i) => (
                  <div key={i} className="modal-item">
                    <strong>{b.modelo}</strong> · {b.cor || "—"} · {b.total} pç
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {b.sizes.map((s) => `${s.tipo ? s.tipo + " " : ""}${s.tamanho}: ${s.qtd}`).join("  ·  ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    </div>
  );
}
