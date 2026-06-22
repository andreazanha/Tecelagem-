import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao, type Volume } from "../api";
import { MedidasModal } from "../components/MedidasModal";
import { br, opCodigo, tipoDe, partesList, parseVolumes, resumoVolumes } from "../expedicaoUtil";

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

  async function mudar(c: CardExpedicao, body: Parameters<typeof api.atualizarExpedicao>[1]) {
    try {
      await api.atualizarExpedicao(c.pedido_id, body);
    } catch {
      alert("Não foi possível atualizar. Tente novamente.");
    } finally {
      recarregar();
    }
  }
  async function salvarMedidas(c: CardExpedicao, vols: Volume[]) {
    await api.atualizarExpedicao(c.pedido_id, { volumes: vols });
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
  const aguardando = filtrados.filter((c) => c.status !== "expedindo");
  const expedindo = filtrados.filter((c) => c.status === "expedindo");

  const colunas = [
    { titulo: "Aguardando expedição", sub: "Chegou da Revisão", cor: "aguardando", lista: aguardando },
    { titulo: "Expedindo", sub: "Separando / embalando", cor: "fazendo", lista: expedindo },
  ];

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

      <div className="stats">
        <Stat n={aguardando.length} l="Aguardando" />
        <Stat n={expedindo.length} l="Expedindo" />
        <Stat n={expedindo.filter((c) => parseVolumes(c.volumes).length === 0).length} l="Medidas pendentes" />
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="kanban">
          {colunas.map((col) => (
            <div className="kcol" key={col.titulo} style={{ flexBasis: 330, maxWidth: 330 }}>
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
                  const expedindoCol = c.status === "expedindo";
                  return (
                    <div className="kcard" key={c.pedido_id}>
                      <div className={"kcard-hd " + t.cls}>
                        <span className="kcard-op">{opCodigo(c)}</span>
                        <span className="kcard-badge">{t.label}</span>
                      </div>
                      <div className="kcard-bd">
                        <div className="kcard-row1">
                          <span className="kcard-cli">{c.cliente_nome}</span>
                          <span className={"kstatus " + (expedindoCol ? "fazendo" : "aguardando")}>{expedindoCol ? "Expedindo" : "Aguardando"}</span>
                        </div>
                        <div className="kcard-partes">
                          {partesList(c.partes).map((p) => (
                            <span key={p.label} className={"kparte " + p.cls}>{p.label}</span>
                          ))}
                        </div>
                        <div className="kcard-prod">{c.pecas || 0} pç</div>
                        {c.observacao && <div className="kcard-obs">📝 {c.observacao}</div>}
                        {expedindoCol && (
                          <div className={"med-flag " + (vols.length ? "ok" : "pend")}>
                            {vols.length ? `✓ Medidas: ${resumoVolumes(vols)}` : "📐 Medidas pendentes — preencha p/ enviar"}
                          </div>
                        )}
                        <div className="kcard-boxes">
                          <div className="kbox ped"><div className="kbox-l">PEDIDO</div><div className="kbox-v">{br(c.data_pedido)}</div></div>
                          <div className="kbox ent"><div className="kbox-l">ENTREGA</div><div className="kbox-v">{br(c.data_entrega)}</div></div>
                        </div>
                        <div className="kcard-acoes" style={{ marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {!expedindoCol ? (
                            <button className="kbtn tecer" onClick={() => mudar(c, { status: "expedindo" })}>▶ Expedir</button>
                          ) : (
                            <>
                              <button className="kbtn final" onClick={() => setMedidas(c)}>📐 Medidas/Volumes</button>
                              <button
                                className="kbtn enviar"
                                disabled={vols.length === 0}
                                title={vols.length === 0 ? "Preencha as medidas primeiro" : ""}
                                onClick={() => mudar(c, { fase: "fiscal", status: "aguardando" })}
                              >
                                Enviar p/ Fiscal ▶
                              </button>
                            </>
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
        O botão 📐 Medidas/Volumes abre o Formulário de Medidas e Pesos (caixa/fardo, várias linhas). Só envia ao Fiscal com as medidas preenchidas.
      </p>

      {medidas && (
        <MedidasModal card={medidas} onFechar={() => setMedidas(null)} onSalvar={(vols) => salvarMedidas(medidas, vols)} />
      )}
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
