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
        <div className="kanban">
          <Coluna titulo="Aguardando" sub="Máquina 3 · Parte 1 / Única" cards={m3} acao={tecer} tipoAcao="tecer" />
          <Coluna titulo="Aguardando" sub="Máquina 7 · Parte 2" cards={m7} acao={tecer} tipoAcao="tecer" />
          <Coluna titulo="Aguardando" sub="Fila de kits" cards={kits} acao={tecer} tipoAcao="tecer" />
          <Coluna
            titulo="Tecendo"
            sub="Em produção"
            cards={tecendo}
            acao={(c) => mudar(c, "pronto")}
            tipoAcao="final"
          />
          <Coluna
            titulo="Tecidos"
            sub="Partes prontas"
            cards={prontasPartes}
            acao={(c) => mudar(c, "enviado")}
            tipoAcao="enviar"
          />
          <Coluna
            titulo="Tecidos"
            sub="Kits prontos"
            cards={prontosKits}
            acao={(c) => mudar(c, "enviado")}
            tipoAcao="enviar"
          />
        </div>
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

function Coluna({
  titulo,
  sub,
  cards,
  acao,
  tipoAcao,
}: {
  titulo: string;
  sub: string;
  cards: CardProducao[];
  acao: (c: CardProducao) => void;
  tipoAcao: "tecer" | "final" | "enviar";
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
          <div className="kcol-title">{titulo}</div>
          <div className="kcol-sub">{sub}</div>
        </div>
        <span className="kcol-count">{cards.length}</span>
      </div>
      <div className="kcol-body">
        {cards.map((c) => {
          const t = TIPO[c.parte] || { label: c.parte, cls: "" };
          const stLabel =
            c.status === "tecendo" ? "Tecendo" : c.status === "pronto" ? "Pronto" : "Aguardando";
          return (
            <div key={c.pedido_id + c.parte} className="kcard">
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
                  <button className={"kbtn " + btn.cls} onClick={() => acao(c)}>
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
