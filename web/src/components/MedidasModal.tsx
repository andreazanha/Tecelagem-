import { useState } from "react";
import type { CardExpedicao, Volume } from "../api";
import { opCodigo, parseVolumes, totalPeso } from "../expedicaoUtil";

const VAZIO: Volume = { tipo: "Caixa", altura: "", largura: "", comprimento: "", peso: "" };

// Formulário de Medidas e Pesos (Expedição). Cada linha = 1 volume (caixa/fardo).
export function MedidasModal({
  card,
  onFechar,
  onSalvar,
}: {
  card: CardExpedicao;
  onFechar: () => void;
  onSalvar: (vols: Volume[]) => Promise<void> | void;
}) {
  const [vols, setVols] = useState<Volume[]>(() => {
    const v = parseVolumes(card.volumes);
    return v.length ? v : [{ ...VAZIO, tipo: "Caixa" }];
  });
  const [salvando, setSalvando] = useState(false);

  const set = (i: number, campo: keyof Volume, valor: string) =>
    setVols((vs) => vs.map((v, idx) => (idx === i ? { ...v, [campo]: valor } : v)));
  const addLinha = () => setVols((vs) => [...vs, { ...VAZIO }]);
  const removeLinha = (i: number) => setVols((vs) => (vs.length > 1 ? vs.filter((_, idx) => idx !== i) : vs));

  const peso = totalPeso(vols);
  const inputCss: React.CSSProperties = {
    width: "100%",
    padding: "9px 10px",
    fontSize: 15,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    textAlign: "center",
  };

  async function salvar() {
    // Mantém só linhas com algum dado preenchido.
    const limpas = vols.filter((v) => v.altura || v.largura || v.comprimento || v.peso);
    setSalvando(true);
    try {
      await onSalvar(limpas);
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd kit">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{opCodigo(card)}</span>
              <span className="modal-pill">📐 Medidas e Pesos</span>
            </span>
            <button className="modal-x" onClick={onFechar}>
              ✕
            </button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{card.cliente_nome}</span>
            <span className="kstatus fazendo">Expedição</span>
          </div>
        </div>

        <div className="modal-bd">
          <div className="med-info">👁 O Fiscal visualiza este formulário para cotar o frete e emitir a NF.</div>

          <div className="med-tab-head">
            <span>CAIXA / FARDO</span>
            <span>ALTURA (cm)</span>
            <span>LARGURA (cm)</span>
            <span>COMPRIM. (cm)</span>
            <span>PESO (kg)</span>
            <span />
          </div>
          {vols.map((v, i) => (
            <div className="med-row" key={i}>
              <select value={v.tipo} onChange={(e) => set(i, "tipo", e.target.value)} style={{ ...inputCss, textAlign: "left" }}>
                <option value="Caixa">Caixa</option>
                <option value="Fardo">Fardo</option>
              </select>
              <input style={inputCss} inputMode="decimal" value={v.altura} onChange={(e) => set(i, "altura", e.target.value)} placeholder="—" />
              <input style={inputCss} inputMode="decimal" value={v.largura} onChange={(e) => set(i, "largura", e.target.value)} placeholder="—" />
              <input style={inputCss} inputMode="decimal" value={v.comprimento} onChange={(e) => set(i, "comprimento", e.target.value)} placeholder="—" />
              <input style={inputCss} inputMode="decimal" value={v.peso} onChange={(e) => set(i, "peso", e.target.value)} placeholder="—" />
              <button className="med-del" title="Remover linha" onClick={() => removeLinha(i)}>
                ✕
              </button>
            </div>
          ))}

          <button className="btn btn-soft" style={{ marginTop: 10 }} onClick={addLinha}>
            ＋ Adicionar linha
          </button>

          <div className="med-totais">
            <span className="med-tot-l">TOTAIS</span>
            <span>📦 Volumes: <strong>{vols.length}</strong></span>
            <span>⚖ Peso total: <strong>{peso ? `${peso.toString().replace(".", ",")} kg` : "—"}</strong></span>
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>
            Cancelar
          </button>
          <button className="kbtn final" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "💾 Salvar medidas"}
          </button>
        </div>
      </div>
    </div>
  );
}
