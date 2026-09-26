import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao, type Volume } from "../api";
import { MedidasModal } from "../components/MedidasModal";
import { br, opCodigo, tipoDe } from "../expedicaoUtil";
import { getUser, podeFuncao } from "../auth";

// Expedição: pedidos aprovados na Revisão chegam aqui. Separe/embale (Expedir),
// preencha o Formulário de Medidas e Pesos (📐) e envie ao Fiscal.
export function Expedicao() {
  const [cards, setCards] = useState<CardExpedicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [medidas, setMedidas] = useState<CardExpedicao | null>(null);

  function recarregar() {
    api
      .listarExpedicao("expedicao")
      .then((d) => Array.isArray(d) && setCards(d))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, []);

  // "Expedir" = salvar as medidas e já enviar ao Fiscal (a pessoa do Fiscal recebe com as medidas prontas).
  async function salvarMedidas(c: CardExpedicao, vols: Volume[]) {
    await api.atualizarExpedicao(c.pedido_id, { volumes: vols, fase: "fiscal", status: "aguardando" });
    setMedidas(null);
    recarregar();
  }

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      q
        ? cards.filter(
            (c) =>
              (c.numero_erp || "").toLowerCase().includes(q) ||
              (c.codigo_pai || "").toLowerCase().includes(q) ||
              (c.cliente_nome || "").toLowerCase().includes(q)
          )
        : cards,
    [cards, q]
  );
  const lista = filtrados;

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>Expedição</h1>
          <div className="breadcrumb">Produção › Expedição</div>
        </div>
        <div className="row-gap">
          <input className="busca-ped" placeholder="🔎 Pedido, código pai ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="card">
          <div className="exp-colh"><span>🚚 Pedidos para expedir</span><span className="exp-c">{lista.length}</span></div>
          <div className="exp-list">
            {lista.length === 0 && <div className="kcol-vazio">Nenhum pedido para expedir.</div>}
            {lista.map((c) => {
              const t = tipoDe(c.partes);
              return (
                <div className="exp-row" key={c.pedido_id}>
                  <span className={"exp-tp " + t.cls}>{t.label}</span>
                  <div className="exp-idcli"><span className="exp-num">{opCodigo(c)}</span><span className="exp-cli">{c.cliente_nome}</span></div>
                  <span className="exp-pcs">{c.pecas || 0} pç</span>
                  <span className="exp-dt">entrega {br(c.data_entrega)}</span>
                  {podeFuncao(getUser(), "expedicao.fase") && (
                    <button className="kbtn tecer" onClick={() => setMedidas(c)}>▶ Expedir</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        Clique em <b>▶ Expedir</b> para abrir a tela de <b>medidas e pesos</b> (caixa/fardo). Ao salvar, o pedido segue para o <b>Fiscal</b> com as medidas prontas para cotar o frete.
      </p>

      {medidas && (
        <MedidasModal card={medidas} onFechar={() => setMedidas(null)} onSalvar={(vols) => salvarMedidas(medidas, vols)} />
      )}
    </div>
  );
}
