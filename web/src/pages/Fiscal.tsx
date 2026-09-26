import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao, type Volume } from "../api";
import { br, opCodigo, tipoDe, parseVolumes, totalPeso } from "../expedicaoUtil";
import { getUser, podeFuncao } from "../auth";
import { MedidasModal } from "../components/MedidasModal";

// Fiscal: pedidos com Expedição finalizada chegam aqui. O Fiscal vê as medidas/volumes
// (somente leitura), cota o frete e marca "NF emitida" → o pedido vai p/ Transporte.
export function Fiscal() {
  const [cards, setCards] = useState<CardExpedicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [nfModal, setNfModal] = useState<CardExpedicao | null>(null);
  const [medidas, setMedidas] = useState<CardExpedicao | null>(null);
  async function salvarMedidas(c: CardExpedicao, vols: Volume[]) {
    await api.atualizarExpedicao(c.pedido_id, { volumes: vols });
    setMedidas(null);
    recarregar();
  }

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
  const lista = filtrados;

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

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="card">
          <div className="fis-colh"><span>🧾 Pedidos para cotar frete / emitir NF</span><span className="fis-c">{lista.length}</span></div>
          <div className="fis-list">
            {lista.length === 0 && <div className="kcol-vazio">Nenhum pedido no Fiscal.</div>}
            {lista.map((c) => {
              const t = tipoDe(c.partes);
              const vols = parseVolumes(c.volumes);
              const peso = totalPeso(vols);
              const cub = vols.reduce((s, v) => s + ((Number(v.altura) * Number(v.largura) * Number(v.comprimento)) || 0), 0) / 1_000_000;
              return (
                <div className="fis-row" key={c.pedido_id}>
                  <div className="fis-top">
                    <span className={"exp-tp " + t.cls}>{t.label}</span>
                    <span className="fis-num">{opCodigo(c)}</span>
                    <span className="fis-cli">{c.cliente_nome}</span>
                    <span className="fis-pcs">{c.pecas || 0} pç · entrega {br(c.data_entrega)}</span>
                    {c.nf_numero && <span className="fis-nf">NF {c.nf_numero}</span>}
                  </div>
                  <div className="fis-med">
                    <div className="fis-med-h">📐 Medidas e pesos (para cotar frete)</div>
                    {vols.length ? (
                      <table className="fis-tab">
                        <thead><tr><th>Volume</th><th>Alt (cm)</th><th>Larg (cm)</th><th>Comp (cm)</th><th>Peso</th></tr></thead>
                        <tbody>
                          {vols.map((v, i) => (
                            <tr key={i}><td>{v.tipo || "Volume"}</td><td>{v.altura || "—"}</td><td>{v.largura || "—"}</td><td>{v.comprimento || "—"}</td><td>{v.peso ? v.peso + " kg" : "—"}</td></tr>
                          ))}
                          <tr className="fis-tot"><td>Total</td><td colSpan={3}>{vols.length} volume(s){cub > 0 ? ` · ${cub.toFixed(3).replace(".", ",")} m³` : ""}</td><td>{peso ? String(peso).replace(".", ",") + " kg" : "—"}</td></tr>
                        </tbody>
                      </table>
                    ) : <div className="fis-med-vaz">Sem medidas ainda — clique em "📐 Ajustar medidas".</div>}
                  </div>
                  {c.frete && <div className="fis-frete-v">💰 Frete: {c.frete}</div>}
                  {c.observacao && <div className="kcard-obs">📝 {c.observacao}</div>}
                  <div className="fis-acoes">
                    {podeFuncao(getUser(), "fiscal.frete") && <button className="kbtn" onClick={() => setMedidas(c)}>📐 Ajustar medidas</button>}
                    {podeFuncao(getUser(), "fiscal.nf") && <button className="kbtn final" onClick={() => setNfModal(c)}>✓ NF emitida → Transporte</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        A NF é emitida no ERP. Aqui o Fiscal confere as medidas, cota o frete e marca "✓ NF emitida" → o pedido segue para o Transporte.
      </p>

      {nfModal && <NfModal card={nfModal} onFechar={() => setNfModal(null)} onConfirmar={(nf, frete) => { setNfModal(null); mudar(nfModal, { fase: "transporte", status: "aguardando", nf_numero: nf, frete }); }} />}
      {medidas && <MedidasModal card={medidas} onFechar={() => setMedidas(null)} onSalvar={(vols) => salvarMedidas(medidas, vols)} />}
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
