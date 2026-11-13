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
  const admin = !!getUser()?.admin; // "gestor" = quem edita o texto padrão
  const [textoPadrao, setTextoPadrao] = useState("");
  const [editTexto, setEditTexto] = useState(false);
  useEffect(() => { api.textoTransportadora().then((d) => setTextoPadrao(d?.texto || "")).catch(() => {}); }, []);
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
          {admin && <button className="btn" onClick={() => setEditTexto(true)} title="Editar a mensagem padrão que vai no final do texto da transportadora">✏️ Texto p/ transportadora</button>}
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
                  {vols.length > 0 && <BlocoTransportadora texto={montarTextoTransp(c, vols, peso, cub, textoPadrao)} />}
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
      {editTexto && <EditarTextoModal valor={textoPadrao} onFechar={() => setEditTexto(false)} onSalvar={async (t) => { try { await api.salvarTextoTransportadora(t); setTextoPadrao(t); } catch { alert("Não foi possível salvar o texto."); } setEditTexto(false); }} />}
    </div>
  );
}

// Formata o VALOR NF (vem como número ou texto) em "R$ 1.234,56".
function valorNF(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  let n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) n = Number(String(v).replace(/\./g, "").replace(",", ".")); // caso venha "1.234,56"
  if (!isFinite(n) || n <= 0) return "";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Monta o texto pronto pra mandar na transportadora: cabeçalho (Cliente + Pedido),
// os dados do destinatário (CNPJ/CEP/Estado/Valor NF/Qtde volume), as medidas que a
// Expedição colocou e, no final, o texto padrão do gestor (se houver).
function montarTextoTransp(c: CardExpedicao, vols: Volume[], peso: number, cub: number, padrao: string): string {
  const razao = c.cliente_razao || c.cliente_nome || "—";
  const cnpj = c.cliente_cnpj_cad || c.cliente_cnpj || "";
  const L: string[] = [];
  L.push(`Cliente: ${razao}`);
  L.push(`Pedido: ${c.numero_erp || c.codigo_pai || "—"}`);
  L.push(`CNPJ DEST: ${cnpj}`);
  L.push(`CEP DEST: ${c.cliente_cep || ""}`);
  L.push(`ESTADO DEST: ${c.cliente_uf || ""}`);
  L.push(`VALOR NF: ${valorNF(c.valor_total)}`);
  L.push(`QTDE DE VOLUME: ${vols.length}`);
  L.push("");
  L.push("Medidas (altura × largura × comprimento):");
  vols.forEach((v, i) => {
    const dims = `${v.altura || "?"} × ${v.largura || "?"} × ${v.comprimento || "?"} cm`;
    const pz = v.peso ? ` · ${String(v.peso).replace(".", ",")} kg` : "";
    L.push(`- ${v.tipo || "Volume"} ${i + 1}: ${dims}${pz}`);
  });
  if (peso) L.push(`Peso total: ${String(peso).replace(".", ",")} kg`);
  if (cub > 0) L.push(`Cubagem: ${cub.toFixed(3).replace(".", ",")} m³`);
  const p = (padrao || "").trim();
  if (p) { L.push(""); L.push(p); }
  return L.join("\n");
}

// Bloco "Texto para a transportadora": mostra o texto pronto e um botão de copiar.
// Qualquer pessoa do Fiscal copia; só o gestor muda o texto padrão (botão no topo).
function BlocoTransportadora({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
      else {
        const ta = document.createElement("textarea");
        ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopiado(true); setTimeout(() => setCopiado(false), 1800);
    } catch { /* ok */ }
  }
  const linhas = Math.min(14, texto.split("\n").length + 1);
  return (
    <div className="fis-transp">
      <div className="fis-transp-h">
        <span>📦 Texto para a transportadora</span>
        <button className={"fis-copiar" + (copiado ? " ok" : "")} onClick={copiar}>{copiado ? "✓ Copiado!" : "📋 Copiar texto"}</button>
      </div>
      <textarea className="fis-transp-txt" readOnly value={texto} rows={linhas} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

// Modal do GESTOR: edita a mensagem padrão (saudação/instruções/contato) que entra no final.
function EditarTextoModal({ valor, onFechar, onSalvar }: { valor: string; onFechar: () => void; onSalvar: (t: string) => void }) {
  const [t, setT] = useState(valor);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Gestor</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
          <div className="modal-hd-row"><span className="modal-cli">Texto padrão para a transportadora</span></div>
        </div>
        <div className="modal-bd">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            Essa mensagem padrão (saudação, instruções de coleta, contato…) entra <b>no final</b> do texto de <b>todos</b> os pedidos.
            O cabeçalho (Cliente e Pedido) e as medidas entram sozinhos. Só o gestor edita aqui.
          </p>
          <textarea style={{ width: "100%", minHeight: 160, padding: "12px 14px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e8f0", lineHeight: 1.4, fontFamily: "inherit" }}
            autoFocus value={t} onChange={(e) => setT(e.target.value)}
            placeholder={"Ex.:\nFavor agendar a coleta no próximo dia útil.\nContato: (00) 00000-0000 — Big Tricot.\nObrigado!"} />
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn final" onClick={() => onSalvar(t)}>✓ Salvar texto padrão</button>
        </div>
      </div>
    </div>
  );
}

function NfModal({ card, onFechar, onConfirmar }: { card: CardExpedicao; onFechar: () => void; onConfirmar: (nf: string, frete: string) => void }) {
  const [nf, setNf] = useState(card.nf_numero || "");
  const [frete, setFrete] = useState(card.frete || "");
  const inputCss: React.CSSProperties = { width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 };
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
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
