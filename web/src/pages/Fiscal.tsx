import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao } from "../api";
import { br, opCodigo, tipoDe, parseVolumes, resumoVolumes, totalPeso } from "../expedicaoUtil";

// Fiscal: pedidos com Expedição finalizada chegam aqui. O Fiscal vê as medidas/volumes
// (somente leitura), cota o frete e marca "NF emitida" → o pedido vai p/ Transporte.
export function Fiscal() {
  const [cards, setCards] = useState<CardExpedicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [nfModal, setNfModal] = useState<CardExpedicao | null>(null);

  function recarregar() {
    api
      .listarExpedicao("fiscal")
      .then((d) => Array.isArray(d) && setCards(d))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, []);

  async function mudar(c: CardExpedicao, body: Parameters<typeof api.atualizarExpedicao>[1]) {
    try {
      await api.atualizarExpedicao(c.pedido_id, body);
    } catch {
      alert("Não foi possível atualizar. Tente novamente.");
    } finally {
      recarregar();
    }
  }

  const q = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      q
        ? cards.filter(
            (c) =>
              (c.numero_erp || "").toLowerCase().includes(q) ||
              (c.codigo_pai || "").toLowerCase().includes(q) ||
              (c.cliente_nome || "").toLowerCase().includes(q) ||
              (c.nf_numero || "").toLowerCase().includes(q)
          )
        : cards,
    [cards, q]
  );
  const aguardando = filtrados.filter((c) => c.status !== "cotando");
  const cotando = filtrados.filter((c) => c.status === "cotando");

  const colunas = [
    { titulo: "Aguardando", sub: "Para emitir NF", cor: "aguardando", lista: aguardando, cotandoCol: false },
    { titulo: "Cotando frete", sub: "Em cotação", cor: "fazendo", lista: cotando, cotandoCol: true },
  ];

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>Fiscal</h1>
          <div className="breadcrumb">Produção › Fiscal</div>
        </div>
        <div className="row-gap">
          <input className="busca-ped" placeholder="🔎 Pedido, cliente, NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      <div className="stats">
        <Stat n={aguardando.length} l="Para emitir" />
        <Stat n={cotando.length} l="Cotando frete" />
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="kanban">
          {colunas.map((col) => (
            <div className="kcol" key={col.titulo} style={{ flexBasis: 350, maxWidth: 350 }}>
              <div className={"kcol-head " + col.cor}>
                <div>
                  <div className="kcol-title"><span className={"kdot " + col.cor} /> {col.titulo}</div>
                  <div className="kcol-sub">{col.sub}</div>
                </div>
                <span className={"kcol-count " + col.cor}>{col.lista.length}</span>
              </div>
              <div className="kcol-body">
                {col.lista.map((c) => {
                  const t = tipoDe(c.partes);
                  const vols = parseVolumes(c.volumes);
                  const peso = totalPeso(vols);
                  return (
                    <div className="kcard" key={c.pedido_id}>
                      <div className={"kcard-hd " + t.cls}>
                        <span className="kcard-op">{opCodigo(c)}</span>
                        <span className="kcard-badge">{t.label}</span>
                      </div>
                      <div className="kcard-bd">
                        <div className="kcard-row1">
                          <span className="kcard-cli">{c.cliente_nome}</span>
                          <span className={"kstatus " + (col.cotandoCol ? "fazendo" : "aguardando")}>{col.cotandoCol ? "Cotando" : "Aguardando"}</span>
                        </div>
                        <div className="kcard-prod">{c.pecas || 0} pç</div>
                        <div className="fis-frete">
                          <div className="fis-frete-t">FORMULÁRIO DE FRETE (Expedição)</div>
                          <div className="fis-frete-r">
                            <span>📦 {resumoVolumes(vols)}</span>
                            {peso > 0 && <span>⚖ {peso.toString().replace(".", ",")} kg</span>}
                          </div>
                          {c.frete && <div className="fis-frete-v">💰 {c.frete}</div>}
                          {c.nf_numero && <div className="fis-frete-nf">NF {c.nf_numero}</div>}
                        </div>
                        {c.observacao && <div className="kcard-obs">📝 {c.observacao}</div>}
                        <div className="kcard-boxes">
                          <div className="kbox ent"><div className="kbox-l">ENTREGA</div><div className="kbox-v">{br(c.data_entrega)}</div></div>
                        </div>
                        <div className="kcard-acoes" style={{ marginTop: 10, justifyContent: "flex-end" }}>
                          {!col.cotandoCol ? (
                            <button className="kbtn tecer" onClick={() => mudar(c, { status: "cotando" })}>Cotar frete ▶</button>
                          ) : (
                            <button className="kbtn final" onClick={() => setNfModal(c)}>✓ NF emitida</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {col.lista.length === 0 && <div className="kcol-vazio">vazio</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        A NF é emitida no ERP. Aqui o Fiscal cota o frete e marca "NF emitida" → o pedido segue para o Transporte.
      </p>

      {nfModal && <NfModal card={nfModal} onFechar={() => setNfModal(null)} onConfirmar={(nf, frete) => { setNfModal(null); mudar(nfModal, { fase: "transporte", status: "aguardando", nf_numero: nf, frete }); }} />}
    </div>
  );
}

function NfModal({ card, onFechar, onConfirmar }: { card: CardExpedicao; onFechar: () => void; onConfirmar: (nf: string, frete: string) => void }) {
  const [nf, setNf] = useState(card.nf_numero || "");
  const [frete, setFrete] = useState(card.frete || "");
  const inputCss: React.CSSProperties = { width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 };
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{opCodigo(card)}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row"><span className="modal-cli">NF emitida → Transporte</span></div>
        </div>
        <div className="modal-bd">
          <label className="campo-l">NÚMERO DA NF</label>
          <input style={inputCss} autoFocus value={nf} onChange={(e) => setNf(e.target.value)} placeholder="ex.: 123456" />
          <label className="campo-l" style={{ marginTop: 14, display: "block" }}>FRETE (opcional)</label>
          <input style={inputCss} value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="ex.: R$ 240 · Transp. X" />
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn final" onClick={() => onConfirmar(nf.trim(), frete.trim())}>✓ Confirmar → Transporte</button>
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
