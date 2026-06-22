import { useEffect, useMemo, useState } from "react";
import { api, type CardExpedicao } from "../api";
import { br, opCodigo, tipoDe, resumoVolumes, parseVolumes, TRANSPORTADORAS, transpNome } from "../expedicaoUtil";

// Transporte: pedidos com NF emitida entram em "Aguardando". Atribua a transportadora
// (cada uma é uma aba). Cards numa transportadora somem após 15 dias (regra do backend).
const ABAS = [{ slug: "aguardando", nome: "Aguardando", ini: "⏳", cor: "#f59e0b" }, ...TRANSPORTADORAS];

export function Transporte() {
  const [cards, setCards] = useState<CardExpedicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("aguardando");

  function recarregar() {
    api
      .listarExpedicao("transporte")
      .then((d) => Array.isArray(d) && setCards(d))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, []);

  async function atribuir(c: CardExpedicao, slug: string) {
    try {
      await api.atualizarExpedicao(c.pedido_id, { status: "enviado", transportadora: slug });
    } catch {
      alert("Não foi possível atribuir. Tente novamente.");
    } finally {
      recarregar();
    }
  }
  async function voltarAguardando(c: CardExpedicao) {
    try {
      await api.atualizarExpedicao(c.pedido_id, { status: "aguardando", transportadora: null });
    } catch {
      alert("Não foi possível voltar. Tente novamente.");
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

  const contar = (slug: string) =>
    slug === "aguardando"
      ? filtrados.filter((c) => !c.transportadora).length
      : filtrados.filter((c) => c.transportadora === slug).length;

  const lista =
    aba === "aguardando" ? filtrados.filter((c) => !c.transportadora) : filtrados.filter((c) => c.transportadora === aba);

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>Transporte</h1>
          <div className="breadcrumb">Produção › Transporte</div>
        </div>
        <div className="row-gap">
          <input className="busca-ped" placeholder="🔎 Pedido, cliente, NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      <div className="tr-abas">
        {ABAS.map((a) => (
          <button
            key={a.slug}
            className={"tr-aba" + (aba === a.slug ? " ativa" : "")}
            style={aba === a.slug ? { borderColor: a.cor, color: a.cor } : undefined}
            onClick={() => setAba(a.slug)}
          >
            <span className="tr-aba-ic" style={{ background: a.cor }}>{a.ini}</span>
            {a.nome}
            <span className="tr-aba-n">{contar(a.slug)}</span>
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : (
        <div className="tr-grade">
          {lista.map((c) => {
            const t = tipoDe(c.partes);
            const vols = parseVolumes(c.volumes);
            return (
              <div className="kcard tr-card" key={c.pedido_id}>
                <div className={"kcard-hd " + t.cls}>
                  <span className="kcard-op">{opCodigo(c)}</span>
                  <span className="kcard-badge">{t.label}</span>
                </div>
                <div className="kcard-bd">
                  <div className="kcard-row1">
                    <span className="kcard-cli">{c.cliente_nome}</span>
                    {c.transportadora ? (
                      <span className="kstatus pronto">{transpNome(c.transportadora)}</span>
                    ) : (
                      <span className="kstatus aguardando">Aguardando</span>
                    )}
                  </div>
                  <div className="kcard-prod">
                    {c.pecas || 0} pç · {resumoVolumes(vols)}
                    {c.nf_numero ? ` · NF ${c.nf_numero}` : ""}
                  </div>
                  {c.frete && <div className="tr-frete">💰 {c.frete}</div>}
                  <div className="kcard-boxes">
                    <div className="kbox ent"><div className="kbox-l">ENTREGA</div><div className="kbox-v">{br(c.data_entrega)}</div></div>
                  </div>
                  {!c.transportadora ? (
                    <div className="tr-atribuir">
                      <div className="tr-atribuir-l">🚚 Atribuir transportadora</div>
                      <div className="tr-chips">
                        {TRANSPORTADORAS.map((tr) => (
                          <button key={tr.slug} className="tr-chip" style={{ borderColor: tr.cor, color: tr.cor }} onClick={() => atribuir(c, tr.slug)}>
                            {tr.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="kcard-acoes" style={{ marginTop: 10, justifyContent: "space-between" }}>
                      <span className="kcard-hint">despachado {br(c.entrou_em)} · some em 15 dias</span>
                      <button className="kbtn" style={{ background: "#e2e8f0", color: "#475569" }} onClick={() => voltarAguardando(c)}>↩ Voltar</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {lista.length === 0 && <div className="kcol-vazio" style={{ gridColumn: "1 / -1" }}>nenhum pedido nesta aba</div>}
        </div>
      )}
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        Atribua a transportadora → o card vai para a aba dela. Pedidos numa transportadora somem automaticamente após 15 dias.
      </p>
    </div>
  );
}
