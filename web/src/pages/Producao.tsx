import { useEffect, useMemo, useState } from "react";
import { api, type CardProducao } from "../api";

const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
const TIPO: Record<string, { label: string; cls: string }> = {
  "parte-1": { label: "PARTE 1", cls: "p1" },
  "parte-2": { label: "PARTE 2", cls: "p2" },
  "parte-unica": { label: "ÚNICA", cls: "unica" },
  "pronta-entrega": { label: "KIT", cls: "kit" },
};
const opCodigo = (c: CardProducao) =>
  (c.parte === "pronta-entrega" ? "KIT " : "OP ") + (c.numero_erp || c.pedido_id.slice(0, 6));
const maqSugerida = (parte: string) =>
  parte === "parte-2" ? "Máq 7" : parte === "pronta-entrega" ? "" : "Máq 3";

export function Producao() {
  const [cards, setCards] = useState<CardProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<CardProducao | null>(null);

  function recarregar() {
    api
      .listarProducao()
      .then(setCards)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(recarregar, []);

  async function mudar(c: CardProducao, status: string, extra?: { maquina?: string; operador?: string }) {
    await api.atualizarProducao(c.pedido_id, c.parte, { status, ...extra });
    setAberto(null);
    recarregar();
  }
  function tecer(c: CardProducao) {
    const maquina = window.prompt("Máquina:", maqSugerida(c.parte));
    if (maquina === null) return;
    const operador = window.prompt("Operador (quem vai tecer):", c.operador || "") ?? "";
    mudar(c, "tecendo", { maquina, operador });
  }

  const por = (f: (c: CardProducao) => boolean) => cards.filter(f);
  const aguardando = (c: CardProducao) => c.status === "aguardando";
  const m3 = por((c) => aguardando(c) && (c.parte === "parte-1" || c.parte === "parte-unica"));
  const m7 = por((c) => aguardando(c) && c.parte === "parte-2");
  const kits = por((c) => aguardando(c) && c.parte === "pronta-entrega");
  const tecendo = por((c) => c.status === "tecendo");
  const prontasPartes = por((c) => c.status === "pronto" && c.parte !== "pronta-entrega");
  const prontosKits = por((c) => c.status === "pronto" && c.parte === "pronta-entrega");

  const maquinas = useMemo(() => {
    const ativ = new Map<string, string>();
    for (const c of tecendo) if (c.maquina) ativ.set(c.maquina, opCodigo(c));
    return Array.from({ length: 8 }, (_, i) => {
      const nome = `Máq ${i + 1}`;
      return { nome, op: ativ.get(nome) || null };
    });
  }, [cards]);

  const hoje = new Date().toISOString().slice(0, 10);
  const noPrazo = cards.filter((c) => !c.data_entrega || c.data_entrega >= hoje).length;
  const pct = cards.length ? Math.round((noPrazo / cards.length) * 100) : 100;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tecelagem</h1>
          <div className="breadcrumb">Produção › Tecelagem</div>
        </div>
        <button className="btn" onClick={recarregar}>
          ↻ Atualizar
        </button>
      </div>

      <div className="stats">
        <Stat n={m3.length + m7.length + kits.length} l="Aguardando" />
        <Stat n={tecendo.length} l="Tecendo" />
        <Stat n={prontasPartes.length + prontosKits.length} l="Tecidos" />
        <Stat n={`${pct}%`} l="No prazo" />
        <Stat n={`${maquinas.filter((m) => m.op).length} / 8`} l="Máquinas ativas" />
      </div>

      <div className="maqstrip">
        {maquinas.map((m) => (
          <span key={m.nome} className={"maqchip" + (m.op ? "" : " livre")}>
            {m.nome} · {m.op || "livre"}
          </span>
        ))}
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : cards.length === 0 ? (
        <div className="card pad empty">
          Nenhuma OP em produção ainda. Crie pedidos em <strong>Pedidos</strong> — eles aparecem aqui
          automaticamente.
        </div>
      ) : (
        <>
          <div className="kanban">
            <Coluna cor="aguardando" titulo="Aguardando" sub="Máquina 3 · Parte 1 / Única" cards={m3} acao={tecer} tipoAcao="tecer" onAbrir={setAberto} />
            <Coluna cor="aguardando" titulo="Aguardando" sub="Máquina 7 · Parte 2" cards={m7} acao={tecer} tipoAcao="tecer" onAbrir={setAberto} />
            <Coluna cor="aguardando" titulo="Aguardando" sub="Fila de kits" cards={kits} acao={tecer} tipoAcao="tecer" onAbrir={setAberto} />
            <Coluna cor="tecendo" titulo="Tecendo" sub="Em produção" cards={tecendo} acao={(c) => mudar(c, "pronto")} tipoAcao="final" onAbrir={setAberto} />
            <Coluna cor="pronto" titulo="Tecidos" sub="Partes prontas" cards={prontasPartes} acao={(c) => mudar(c, "enviado")} tipoAcao="enviar" onAbrir={setAberto} />
            <Coluna cor="pronto" titulo="Tecidos" sub="Kits prontos" cards={prontosKits} acao={(c) => mudar(c, "enviado")} tipoAcao="enviar" onAbrir={setAberto} />
          </div>
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            Parte 1 (Máq 3) e Parte 2 (Máq 7) seguem separadas até o Corte · Kits separados. Clique no
            card p/ detalhes.
          </p>
        </>
      )}

      {aberto && <CardModal card={aberto} onFechar={() => setAberto(null)} onAcao={mudar} onTecer={tecer} />}
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

function Coluna({
  cor,
  titulo,
  sub,
  cards,
  acao,
  tipoAcao,
  onAbrir,
}: {
  cor: "aguardando" | "tecendo" | "pronto";
  titulo: string;
  sub: string;
  cards: CardProducao[];
  acao: (c: CardProducao) => void;
  tipoAcao: "tecer" | "final" | "enviar";
  onAbrir: (c: CardProducao) => void;
}) {
  const btn =
    tipoAcao === "tecer"
      ? { cls: "tecer", label: "Tecer" }
      : tipoAcao === "final"
        ? { cls: "final", label: "Finalizar" }
        : { cls: "enviar", label: "Enviar ▶" };
  return (
    <div className="kcol">
      <div className="kcol-head">
        <div>
          <div className="kcol-title">
            <span className={"kdot " + cor} /> {titulo}
          </div>
          <div className="kcol-sub">{sub}</div>
        </div>
        <span className={"kcol-count " + cor}>{cards.length}</span>
      </div>
      <div className="kcol-body">
        {cards.map((c) => {
          const t = TIPO[c.parte] || { label: c.parte, cls: "" };
          const stLabel =
            c.status === "tecendo" ? "Tecendo" : c.status === "pronto" ? "Pronto" : "Aguardando";
          return (
            <div key={c.pedido_id + c.parte} className="kcard" onClick={() => onAbrir(c)} style={{ cursor: "pointer" }}>
              <div className={"kcard-hd " + t.cls}>
                <span className="kcard-op">{opCodigo(c)}</span>
                <span className="kcard-badge">{t.label}</span>
              </div>
              <div className="kcard-bd">
                <div className="kcard-row1">
                  <span className="kcard-cli">{c.cliente_nome}</span>
                  <span className={"kstatus " + c.status}>{stLabel}</span>
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
                    {c.status === "tecendo"
                      ? `${c.maquina || "—"}${c.operador ? " · " + c.operador : ""}`
                      : "toque p/ detalhes"}
                  </span>
                  <button
                    className={"kbtn " + btn.cls}
                    onClick={(e) => {
                      e.stopPropagation();
                      acao(c);
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

function CardModal({
  card,
  onFechar,
  onAcao,
  onTecer,
}: {
  card: CardProducao;
  onFechar: () => void;
  onAcao: (c: CardProducao, status: string) => void;
  onTecer: (c: CardProducao) => void;
}) {
  const [det, setDet] = useState<Awaited<ReturnType<typeof api.detalheProducao>> | null>(null);
  useEffect(() => {
    api.detalheProducao(card.pedido_id, card.parte).then(setDet).catch(() => {});
  }, [card.pedido_id, card.parte]);

  const t = TIPO[card.parte] || { label: card.parte, cls: "" };
  const stLabel = card.status === "tecendo" ? "Tecendo" : card.status === "pronto" ? "Pronto" : "Aguardando";
  const setor = "Tecelagem";
  const origem =
    card.status === "tecendo"
      ? `${setor} · ${card.maquina || "—"}`
      : card.parte === "parte-2"
        ? `${setor} · Máquina 7`
        : `${setor} · Máquina 3`;

  // dias para a entrega
  let faltam = "";
  if (card.data_entrega) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ent = new Date(card.data_entrega + "T00:00:00");
    const d = Math.round((ent.getTime() - hoje.getTime()) / 86400000);
    faltam = d < 0 ? `${-d} dia(s) atrasado` : d === 0 ? "entrega hoje" : `faltam ${d} dia(s)`;
  }

  const cores = [...new Set((det?.blocos || []).map((b) => b.cor).filter(Boolean))].join(", ");
  const modelos = [...new Set((det?.blocos || []).map((b) => b.modelo).filter(Boolean))].join(", ");

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
            <span className={"kstatus " + card.status}>{setor} · {stLabel}</span>
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
              {faltam && <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginTop: 2 }}>⚠ {faltam}</div>}
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
            <Campo l="SETOR ATUAL" v={setor} />
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

          <div className="modal-hist">
            <div className="campo-l">HISTÓRICO</div>
            <div className="hist">
              <span className="hdot ok" /> Criação <span className="muted">{brLong(card.data_pedido)}</span>
              {card.iniciado_em && (
                <>
                  <span className="hsep" />
                  <span className="hdot ok" /> Tecelagem <span className="muted">{card.iniciado_em.slice(0, 10).split("-").reverse().join("/")}{card.maquina ? " · " + card.maquina : ""}</span>
                </>
              )}
              {card.status === "pronto" && (
                <>
                  <span className="hsep" />
                  <span className="hdot now" /> Tecido <span className="muted">pronto p/ próxima fase</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>
            Fechar
          </button>
          <span className="row-gap">
            {card.status === "aguardando" && (
              <button className="kbtn tecer" onClick={() => onTecer(card)}>
                Tecer
              </button>
            )}
            {card.status === "tecendo" && (
              <button className="kbtn final" onClick={() => onAcao(card, "pronto")}>
                ✓ Finalizar
              </button>
            )}
            {card.status === "pronto" && (
              <button className="kbtn enviar" onClick={() => onAcao(card, "enviado")}>
                Enviar ▶
              </button>
            )}
          </span>
        </div>
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

function brLong(d?: string | null) {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
